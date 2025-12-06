package wireguard

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/golang/protobuf/proto"
	"golang.zx2c4.com/wireguard/wgctrl"
	"golang.zx2c4.com/wireguard/wgctrl/wgtypes"
	"go.uber.org/zap"
)

// PeerMetadata stores information about a WireGuard peer
type PeerMetadata struct {
	PublicKey       string    `json:"public_key"`
	AllowedIPs      []string  `json:"allowed_ips"`
	LastHandshake   time.Time `json:"last_handshake"`
	SessionID       string    `json:"session_id"`
	UserAddress     string    `json:"user_address"`
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}

// WireGuardManager manages WireGuard peers
type WireGuardManager struct {
	interfaceName string
	client        *wgctrl.Client
	peers         map[string]*PeerMetadata // publicKey -> metadata
	logger        *zap.Logger
	mu            sync.RWMutex
}

// NewWireGuardManager creates a new WireGuard manager
func NewWireGuardManager(interfaceName string, logger *zap.Logger) (*WireGuardManager, error) {
	client, err := wgctrl.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create wgctrl client: %w", err)
	}

	wgm := &WireGuardManager{
		interfaceName: interfaceName,
		client:        client,
		peers:         make(map[string]*PeerMetadata),
		logger:        logger,
	}

	// Load existing peers from the interface
	if err := wgm.loadExistingPeers(); err != nil {
		logger.Warn("failed to load existing peers", zap.Error(err))
	}

	return wgm, nil
}

// loadExistingPeers loads existing peers from the WireGuard interface
func (wgm *WireGuardManager) loadExistingPeers() error {
	device, err := wgm.client.Device(wgm.interfaceName)
	if err != nil {
		return fmt.Errorf("failed to get device: %w", err)
	}

	for _, peer := range device.Peers {
		metadata := &PeerMetadata{
			PublicKey:     peer.PublicKey.String(),
			AllowedIPs:     peer.AllowedIPsToStrings(),
			LastHandshake:  peer.LastHandshakeTime,
			CreatedAt:      time.Now(), // We don't know the actual creation time
			UpdatedAt:      time.Now(),
		}
		wgm.peers[peer.PublicKey.String()] = metadata
	}

	wgm.logger.Info("loaded existing peers", zap.Int("count", len(device.Peers)))
	return nil
}

// AddPeer adds a new WireGuard peer for a session
func (wgm *WireGuardManager) AddPeer(sessionID, userAddress string, allowedIPs []string) (*PeerMetadata, error) {
	// Generate a new key pair for the peer
	privateKey, err := wgtypes.GeneratePrivateKey()
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	publicKey := privateKey.PublicKey()
	publicKeyStr := publicKey.String()

	metadata := &PeerMetadata{
		PublicKey:   publicKeyStr,
		AllowedIPs:  allowedIPs,
		SessionID:   sessionID,
		UserAddress: userAddress,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	// Configure the peer
	peerConfig := wgtypes.PeerConfig{
		PublicKey:         publicKey,
		ReplaceAllowedIPs: true,
		AllowedIPs:        parseAllowedIPs(allowedIPs),
	}

	// Apply the configuration
	err = wgm.client.ConfigureDevice(wgm.interfaceName, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{peerConfig},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to configure peer: %w", err)
	}

	wgm.mu.Lock()
	wgm.peers[publicKeyStr] = metadata
	wgm.mu.Unlock()

	wgm.logger.Info("added WireGuard peer",
		zap.String("session_id", sessionID),
		zap.String("user_address", userAddress),
		zap.String("public_key", publicKeyStr),
		zap.Strings("allowed_ips", allowedIPs))

	return metadata, nil
}

// RemovePeer removes a WireGuard peer
func (wgm *WireGuardManager) RemovePeer(publicKey string) error {
	pubKey, err := wgtypes.ParseKey(publicKey)
	if err != nil {
		return fmt.Errorf("invalid public key: %w", err)
	}

	// Remove the peer
	err = wgm.client.ConfigureDevice(wgm.interfaceName, wgtypes.Config{
		Peers: []wgtypes.PeerConfig{
			{
				PublicKey: pubKey,
				Remove:    true,
			},
		},
	})
	if err != nil {
		return fmt.Errorf("failed to remove peer: %w", err)
	}

	wgm.mu.Lock()
	delete(wgm.peers, publicKey)
	wgm.mu.Unlock()

	wgm.logger.Info("removed WireGuard peer", zap.String("public_key", publicKey))
	return nil
}

// GetPeer gets metadata for a peer
func (wgm *WireGuardManager) GetPeer(publicKey string) (*PeerMetadata, error) {
	wgm.mu.RLock()
	defer wgm.mu.RUnlock()

	metadata, exists := wgm.peers[publicKey]
	if !exists {
		return nil, fmt.Errorf("peer not found: %s", publicKey)
	}

	// Update handshake time from actual device
	device, err := wgm.client.Device(wgm.interfaceName)
	if err == nil {
		for _, peer := range device.Peers {
			if peer.PublicKey.String() == publicKey {
				metadata.LastHandshake = peer.LastHandshakeTime
				metadata.UpdatedAt = time.Now()
				break
			}
		}
	}

	return metadata, nil
}

// GetPeerBySessionID finds a peer by session ID
func (wgm *WireGuardManager) GetPeerBySessionID(sessionID string) (*PeerMetadata, error) {
	wgm.mu.RLock()
	defer wgm.mu.RUnlock()

	for _, metadata := range wgm.peers {
		if metadata.SessionID == sessionID {
			return metadata, nil
		}
	}

	return nil, fmt.Errorf("peer not found for session ID: %s", sessionID)
}

// ListPeers returns all peers
func (wgm *WireGuardManager) ListPeers() map[string]*PeerMetadata {
	wgm.mu.RLock()
	defer wgm.mu.RUnlock()

	// Create a copy to avoid race conditions
	result := make(map[string]*PeerMetadata)
	for k, v := range wgm.peers {
		// Update handshake times
		device, err := wgm.client.Device(wgm.interfaceName)
		if err == nil {
			for _, peer := range device.Peers {
				if peer.PublicKey.String() == k {
					v.LastHandshake = peer.LastHandshakeTime
					v.UpdatedAt = time.Now()
					break
				}
			}
		}
		result[k] = v
	}

	return result
}

// GenerateConfig generates a WireGuard configuration for a peer
func (wgm *WireGuardManager) GenerateConfig(publicKey string) (string, error) {
	device, err := wgm.client.Device(wgm.interfaceName)
	if err != nil {
		return "", fmt.Errorf("failed to get device: %w", err)
	}

	metadata, err := wgm.GetPeer(publicKey)
	if err != nil {
		return "", err
	}

	// Generate client private key (in a real implementation, this would be provided by the client)
	clientPrivateKey, err := wgtypes.GenerateKey()
	if err != nil {
		return "", fmt.Errorf("failed to generate client private key: %w", err)
	}

	config := fmt.Sprintf(`[Interface]
PrivateKey = %s
Address = %s
DNS = 1.1.1.1, 8.8.8.8

[Peer]
PublicKey = %s
AllowedIPs = %s
Endpoint = %s
PersistentKeepalive = 25
`,
		clientPrivateKey.String(),
		strings.Join(metadata.AllowedIPs, ", "),
		device.PublicKey.String(),
		strings.Join(metadata.AllowedIPs, ", "),
		"TODO: get endpoint from node registry",
	)

	return config, nil
}

// Cleanup removes all peers managed by this manager
func (wgm *WireGuardManager) Cleanup() error {
	wgm.mu.Lock()
	defer wgm.mu.Unlock()

	var errs []string

	for publicKey := range wgm.peers {
		if err := wgm.RemovePeer(publicKey); err != nil {
			errs = append(errs, fmt.Sprintf("failed to remove peer %s: %v", publicKey, err))
		}
	}

	if len(errs) > 0 {
		return fmt.Errorf("cleanup errors: %s", strings.Join(errs, "; "))
	}

	return nil
}

// parseAllowedIPs parses string IPs to net.IPNet
func parseAllowedIPs(ips []string) []net.IPNet {
	var result []net.IPNet
	for _, ip := range ips {
		if _, ipNet, err := net.ParseCIDR(ip); err == nil {
			result = append(result, *ipNet)
		}
	}
	return result
}

// GenerateAllowedIPs generates allowed IPs for a new peer
func GenerateAllowedIPs(baseIP string, count int) ([]string, error) {
	ip, ipNet, err := net.ParseCIDR(baseIP)
	if err != nil {
		return nil, fmt.Errorf("invalid base IP: %w", err)
	}

	var ips []string
	current := ip

	for i := 0; i < count; i++ {
		if !ipNet.Contains(current) {
			return nil, fmt.Errorf("ran out of IPs in network")
		}

		ips = append(ips, fmt.Sprintf("%s/32", current.String()))

		// Increment IP
		for j := len(current) - 1; j >= 0; j-- {
			current[j]++
			if current[j] != 0 {
				break
			}
		}
	}

	return ips, nil
}