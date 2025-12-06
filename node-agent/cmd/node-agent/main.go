package main

import (
	"context"
	"fmt"
	"math/big"
	"os"
	"os/signal"
	"syscall"
	"time"

	"go.uber.org/zap"

	"github.com/x402/node-agent/internal/api"
	"github.com/x402/node-agent/internal/bindings"
	"github.com/x402/node-agent/internal/blockchain"
	"github.com/x402/node-agent/internal/config"
	"github.com/x402/node-agent/internal/session"
	"github.com/x402/node-agent/internal/settlement"
	"github.com/x402/node-agent/internal/wireguard"
)

// Agent is the main node agent
type Agent struct {
	config           *config.Config
	logger           *zap.Logger
	sessionCache     *session.Cache
	wgManager        *wireguard.WireGuardManager
	blockchainClient *blockchain.Client
	apiServer        *api.Server
	settlementScheduler *settlement.Scheduler
	ctx              context.Context
	cancel           context.CancelFunc
}

// NewAgent creates a new node agent
func NewAgent(cfg *config.Config) (*Agent, error) {
	// Initialize logger
	logger, err := zap.NewProduction()
	if err != nil {
		return nil, fmt.Errorf("failed to create logger: %w", err)
	}

	// Initialize session cache
	sessionCache := session.NewCache(logger)

	// Initialize WireGuard manager
	wgManager, err := wireguard.NewWireGuardManager(cfg.WGInterface, logger)
	if err != nil {
		logger.Error("failed to create WireGuard manager", zap.Error(err))
		return nil, fmt.Errorf("failed to create WireGuard manager: %w", err)
	}

	// Initialize blockchain client
	blockchainClient, err := blockchain.NewClient(
		cfg.RPCURL,
		cfg.SessionManager,
		cfg.NodePrivateKey,
		cfg.RetryMax,
		cfg.RetryDelay,
		logger,
	)
	if err != nil {
		logger.Error("failed to create blockchain client", zap.Error(err))
		return nil, fmt.Errorf("failed to create blockchain client: %w", err)
	}

	// Initialize API server
	apiServer := api.NewServer(
		cfg.RestPort,
		sessionCache,
		wgManager,
		"default-auth-token", // TODO: make configurable
		logger,
	)

	// Initialize settlement scheduler
	settlementScheduler := settlement.NewScheduler(
		sessionCache,
		blockchainClient,
		cfg.SettleInterval,
		logger,
	)

	ctx, cancel := context.WithCancel(context.Background())

	return &Agent{
		config:              cfg,
		logger:              logger,
		sessionCache:        sessionCache,
		wgManager:           wgManager,
		blockchainClient:    blockchainClient,
		apiServer:           apiServer,
		settlementScheduler: settlementScheduler,
		ctx:                 ctx,
		cancel:              cancel,
	}, nil
}

// Start starts the node agent
func (a *Agent) Start() error {
	a.logger.Info("starting X402 node agent",
		zap.String("node_address", a.config.NodeAddress),
		zap.Uint64("node_id", a.config.NodeID),
		zap.String("wg_interface", a.config.WGInterface))

	// Start settlement scheduler
	a.settlementScheduler.Start()

	// Start blockchain event listener
	go a.handleBlockchainEvents()

	// Start API server
	go func() {
		if err := a.apiServer.Start(); err != nil {
			a.logger.Error("API server failed", zap.Error(err))
			a.cancel()
		}
	}()

	a.logger.Info("X402 node agent started successfully")
	return nil
}

// Stop stops the node agent
func (a *Agent) Stop() error {
	a.logger.Info("stopping X402 node agent")

	// Cancel context
	a.cancel()

	// Stop settlement scheduler
	a.settlementScheduler.Stop()

	// Cleanup WireGuard peers
	if err := a.wgManager.Cleanup(); err != nil {
		a.logger.Error("failed to cleanup WireGuard peers", zap.Error(err))
	}

	// Close blockchain client
	a.blockchainClient.Close()

	// Sync logger
	a.logger.Sync()

	a.logger.Info("X402 node agent stopped")
	return nil
}

// handleBlockchainEvents handles blockchain events
func (a *Agent) handleBlockchainEvents() {
	nodeID := big.NewInt(int64(a.config.NodeID))
	
	for {
		select {
		case <-a.ctx.Done():
			return
		default:
			a.logger.Info("connecting to blockchain events")
			
			sessionStartedCh, sessionSettledCh, sessionStoppedCh, sub, err := a.blockchainClient.SubscribeToEvents(a.ctx, nodeID)
			if err != nil {
				a.logger.Error("failed to subscribe to events", zap.Error(err))
				time.Sleep(5 * time.Second)
				continue
			}

			a.logger.Info("subscribed to blockchain events")
			
			// Handle events
			a.handleEvents(sessionStartedCh, sessionSettledCh, sessionStoppedCh)
			
			// Unsubscribe and reconnect
			sub.Unsubscribe()
			time.Sleep(time.Second)
		}
	}
}

// handleEvents processes blockchain events
func (a *Agent) handleEvents(
	startedCh <-chan *bindings.SessionStarted,
	settledCh <-chan *bindings.SessionSettled,
	stoppedCh <-chan *bindings.SessionStopped,
) {
	for {
		select {
		case <-a.ctx.Done():
			return

		case event, ok := <-startedCh:
			if !ok {
				return
			}
			a.handleSessionStarted(event)

		case event, ok := <-settledCh:
			if !ok {
				return
			}
			a.handleSessionSettled(event)

		case event, ok := <-stoppedCh:
			if !ok {
				return
			}
			a.handleSessionStopped(event)
		}
	}
}

// handleSessionStarted handles SessionStarted events
func (a *Agent) handleSessionStarted(event *bindings.SessionStarted) {
	a.logger.Info("session started",
		zap.String("session_id", event.SessionId.Hex()),
		zap.String("user", event.User.Hex()),
		zap.Uint64("node_id", event.NodeId.Uint64()),
		zap.Uint64("rate", event.Rate.Uint64()),
		zap.Uint64("max_spend", event.MaxSpend.Uint64()),
		zap.Uint64("deposited", event.Deposited.Uint64()))

	// Create session
	sess := &session.Session{
		ID:         event.SessionId.Hex(),
		User:       event.User.Hex(),
		NodeID:     event.NodeId.Uint64(),
		Rate:       event.Rate.Uint64(),
		MaxSpend:   event.MaxSpend.Uint64(),
		Deposited:  event.Deposited.Uint64(),
		Settled:    0,
		StartTime:  time.Now(),
		LastSettle: time.Now(),
		Active:     true,
	}

	// Generate allowed IPs for this session
	allowedIPs, err := wireguard.GenerateAllowedIPs("10.0.0.0/24", 1)
	if err != nil {
		a.logger.Error("failed to generate allowed IPs",
			zap.String("session_id", sess.ID),
			zap.Error(err))
		return
	}
	sess.AllowedIPs = allowedIPs

	// Add WireGuard peer
	peerMetadata, err := a.wgManager.AddPeer(sess.ID, sess.User, allowedIPs)
	if err != nil {
		a.logger.Error("failed to add WireGuard peer",
			zap.String("session_id", sess.ID),
			zap.Error(err))
		return
	}

	sess.PublicKey = peerMetadata.PublicKey

	// Add to cache
	if err := a.sessionCache.Add(sess); err != nil {
		a.logger.Error("failed to add session to cache",
			zap.String("session_id", sess.ID),
			zap.Error(err))
		// Try to cleanup the peer
		_ = a.wgManager.RemovePeer(peerMetadata.PublicKey)
		return
	}
}

// handleSessionSettled handles SessionSettled events
func (a *Agent) handleSessionSettled(event *bindings.SessionSettled) {
	sessionID := event.SessionId.Hex()
	
	a.logger.Info("session settled",
		zap.String("session_id", sessionID),
		zap.Uint64("elapsed", event.Elapsed.Uint64()),
		zap.Uint64("cost", event.Cost.Uint64()),
		zap.Uint64("protocol_fee", event.ProtocolFee.Uint64()),
		zap.Uint64("node_earning", event.NodeEarning.Uint64()))

	// Update cache
	if err := a.sessionCache.UpdateSettlement(sessionID, event.Cost.Uint64()); err != nil {
		a.logger.Error("failed to update session settlement",
			zap.String("session_id", sessionID),
			zap.Error(err))
	}
}

// handleSessionStopped handles SessionStopped events
func (a *Agent) handleSessionStopped(event *bindings.SessionStopped) {
	sessionID := event.SessionId.Hex()
	
	a.logger.Info("session stopped",
		zap.String("session_id", sessionID),
		zap.Uint64("refund", event.Refund.Uint64()))

	// Get session from cache
	sess, err := a.sessionCache.Get(sessionID)
	if err != nil {
		a.logger.Error("session not found in cache",
			zap.String("session_id", sessionID),
			zap.Error(err))
		return
	}

	// Remove WireGuard peer if it exists
	if sess.PublicKey != "" {
		if err := a.wgManager.RemovePeer(sess.PublicKey); err != nil {
			a.logger.Error("failed to remove WireGuard peer",
				zap.String("session_id", sessionID),
				zap.String("public_key", sess.PublicKey),
				zap.Error(err))
		}
	}

	// Deactivate in cache
	if err := a.sessionCache.Deactivate(sessionID); err != nil {
		a.logger.Error("failed to deactivate session",
			zap.String("session_id", sessionID),
			zap.Error(err))
	}
}

func main() {
	// Handle command line flags
	if len(os.Args) > 1 && (os.Args[1] == "-h" || os.Args[1] == "--help") {
		config.PrintUsage()
	}

	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		fmt.Printf("Failed to load configuration: %v\n", err)
		os.Exit(1)
	}

	// Validate configuration
	if err := cfg.Validate(); err != nil {
		fmt.Printf("Configuration validation failed: %v\n", err)
		os.Exit(1)
	}

	// Create and start agent
	agent, err := NewAgent(cfg)
	if err != nil {
		fmt.Printf("Failed to create agent: %v\n", err)
		os.Exit(1)
	}

	// Setup signal handling
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Start agent
	if err := agent.Start(); err != nil {
		agent.logger.Error("failed to start agent", zap.Error(err))
		os.Exit(1)
	}

	// Wait for shutdown signal
	<-sigCh
	agent.logger.Info("received shutdown signal")

	// Stop agent
	if err := agent.Stop(); err != nil {
		agent.logger.Error("failed to stop agent", zap.Error(err))
		os.Exit(1)
	}
}