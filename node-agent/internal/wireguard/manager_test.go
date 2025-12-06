package wireguard

import (
    "fmt"
    "testing"
    "time"

    "go.uber.org/zap/zaptest"
)

func TestGenerateAllowedIPs(t *testing.T) {
    logger := zaptest.NewLogger(t)
    
    tests := []struct {
        name    string
        baseIP  string
        count   int
        wantErr bool
    }{
        {
            name:    "valid IPv4 range",
            baseIP:  "10.0.0.0/24",
            count:   3,
            wantErr: false,
        },
        {
            name:    "invalid IP format",
            baseIP:  "invalid",
            count:   1,
            wantErr: true,
        },
        {
            name:    "zero count",
            baseIP:  "10.0.0.0/24",
            count:   0,
            wantErr: false,
        },
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            ips, err := GenerateAllowedIPs(tt.baseIP, tt.count)
            if (err != nil) != tt.wantErr {
                t.Errorf("GenerateAllowedIPs() error = %v, wantErr %v", err, tt.wantErr)
                return
            }
            if !tt.wantErr && len(ips) != tt.count {
                t.Errorf("GenerateAllowedIPs() got %d IPs, want %d", len(ips), tt.count)
            }
        })
    }
}

func TestPeerMetadata(t *testing.T) {
    logger := zaptest.NewLogger(t)
    
    metadata := &PeerMetadata{
        PublicKey:     "test-key",
        AllowedIPs:    []string{"10.0.0.1/32"},
        LastHandshake:  time.Now(),
        SessionID:     "test-session",
        UserAddress:   "0x1234567890123456789012345678901234567890",
        CreatedAt:     time.Now(),
        UpdatedAt:     time.Now(),
    }

    if metadata.SessionID != "test-session" {
        t.Errorf("Expected session ID 'test-session', got '%s'", metadata.SessionID)
    }

    if len(metadata.AllowedIPs) != 1 {
        t.Errorf("Expected 1 allowed IP, got %d", len(metadata.AllowedIPs))
    }
}

// MockWireGuardManager for testing
type MockWireGuardManager struct {
    peers map[string]*PeerMetadata
}

func NewMockWireGuardManager() *MockWireGuardManager {
    return &MockWireGuardManager{
        peers: make(map[string]*PeerMetadata),
    }
}

func (m *MockWireGuardManager) AddPeer(sessionID, userAddress string, allowedIPs []string) (*PeerMetadata, error) {
    metadata := &PeerMetadata{
        PublicKey:     "mock-public-key",
        AllowedIPs:    allowedIPs,
        SessionID:    sessionID,
        UserAddress:  userAddress,
        CreatedAt:    time.Now(),
        UpdatedAt:    time.Now(),
    }
    m.peers[metadata.PublicKey] = metadata
    return metadata, nil
}

func (m *MockWireGuardManager) RemovePeer(publicKey string) error {
    delete(m.peers, publicKey)
    return nil
}

func (m *MockWireGuardManager) GetPeer(publicKey string) (*PeerMetadata, error) {
    peer, exists := m.peers[publicKey]
    if !exists {
        return nil, fmt.Errorf("peer not found")
    }
    return peer, nil
}

func (m *MockWireGuardManager) GetPeerBySessionID(sessionID string) (*PeerMetadata, error) {
    for _, peer := range m.peers {
        if peer.SessionID == sessionID {
            return peer, nil
        }
    }
    return nil, fmt.Errorf("peer not found for session ID")
}

func (m *MockWireGuardManager) ListPeers() map[string]*PeerMetadata {
    result := make(map[string]*PeerMetadata)
    for k, v := range m.peers {
        result[k] = v
    }
    return result
}

func (m *MockWireGuardManager) GenerateConfig(publicKey string) (string, error) {
    return "[Interface]\nPrivateKey = mock-private-key\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = mock-server-key\nAllowedIPs = 0.0.0.0/0\n", nil
}

func (m *MockWireGuardManager) Cleanup() error {
    m.peers = make(map[string]*PeerMetadata)
    return nil
}

func TestMockWireGuardManager(t *testing.T) {
    manager := NewMockWireGuardManager()
    
    // Test adding peer
    peer, err := manager.AddPeer("test-session", "0x1234567890123456789012345678901234567890", []string{"10.0.0.1/32"})
    if err != nil {
        t.Fatalf("Failed to add peer: %v", err)
    }
    
    if peer.SessionID != "test-session" {
        t.Errorf("Expected session ID 'test-session', got '%s'", peer.SessionID)
    }
    
    // Test getting peer
    retrieved, err := manager.GetPeer(peer.PublicKey)
    if err != nil {
        t.Fatalf("Failed to get peer: %v", err)
    }
    
    if retrieved.SessionID != peer.SessionID {
        t.Errorf("Retrieved peer has different session ID")
    }
    
    // Test removing peer
    err = manager.RemovePeer(peer.PublicKey)
    if err != nil {
        t.Fatalf("Failed to remove peer: %v", err)
    }
    
    _, err = manager.GetPeer(peer.PublicKey)
    if err == nil {
        t.Error("Expected error when getting removed peer")
    }
}