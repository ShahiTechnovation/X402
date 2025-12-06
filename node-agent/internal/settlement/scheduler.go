package settlement

import (
	"context"
	"fmt"
	"math/big"
	"sync"
	"time"

	"go.uber.org/zap"

	"github.com/x402/node-agent/internal/blockchain"
	"github.com/x402/node-agent/internal/session"
)

// Scheduler manages periodic settlement of sessions
type Scheduler struct {
	sessionCache    *session.Cache
	blockchainClient *blockchain.Client
	settleInterval   time.Duration
	logger          *zap.Logger
	ticker          *time.Ticker
	stopCh          chan struct{}
	wg              sync.WaitGroup
	mu              sync.Mutex
	running         bool
}

// NewScheduler creates a new settlement scheduler
func NewScheduler(
	sessionCache *session.Cache,
	blockchainClient *blockchain.Client,
	settleInterval time.Duration,
	logger *zap.Logger,
) *Scheduler {
	return &Scheduler{
		sessionCache:     sessionCache,
		blockchainClient: blockchainClient,
		settleInterval:   settleInterval,
		logger:          logger,
		stopCh:          make(chan struct{}),
	}
}

// Start starts the settlement scheduler
func (s *Scheduler) Start() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.running {
		s.logger.Warn("settlement scheduler already running")
		return
	}

	s.running = true
	s.ticker = time.NewTicker(s.settleInterval)

	s.wg.Add(1)
	go s.settlementLoop()

	s.logger.Info("settlement scheduler started",
		zap.Duration("interval", s.settleInterval))
}

// Stop stops the settlement scheduler
func (s *Scheduler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	s.running = false
	if s.ticker != nil {
		s.ticker.Stop()
	}
	close(s.stopCh)
	s.wg.Wait()

	s.logger.Info("settlement scheduler stopped")
}

// settlementLoop runs the main settlement loop
func (s *Scheduler) settlementLoop() {
	defer s.wg.Done()

	// Run once immediately on start
	s.settleSessions()

	for {
		select {
		case <-s.ticker.C:
			s.settleSessions()
		case <-s.stopCh:
			return
		}
	}
}

// settleSessions settles all sessions that need settlement
func (s *Scheduler) settleSessions() {
	s.logger.Debug("checking sessions for settlement")

	// Get sessions that need settlement
	sessionsNeedingSettlement := s.sessionCache.GetSessionsNeedingSettlement(s.settleInterval)
	if len(sessionsNeedingSettlement) == 0 {
		s.logger.Debug("no sessions need settlement")
		return
	}

	s.logger.Info("settling sessions",
		zap.Int("count", len(sessionsNeedingSettlement)))

	// Settle each session concurrently
	var wg sync.WaitGroup
	for _, sess := range sessionsNeedingSettlement {
		wg.Add(1)
		go func(session *session.Session) {
			defer wg.Done()
			s.settleSingleSession(session)
		}(sess)
	}

	wg.Wait()
}

// settleSingleSession settles a single session
func (s *Scheduler) settleSingleSession(sess *session.Session) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	s.logger.Info("settling session",
		zap.String("session_id", sess.ID),
		zap.String("user", sess.User),
		zap.Uint64("node_id", sess.NodeID))

	// Convert session ID to bytes32
	var sessionID [32]byte
	sessionIDBytes, err := fmt.Sprintf("%x", sess.ID), nil
	if len(sessionIDBytes) >= 64 {
		copy(sessionID[:], []byte(sessionIDBytes[:64]))
	} else {
		copy(sessionID[:], make([]byte, 64-len(sessionIDBytes)))
		copy(sessionID[64-len(sessionIDBytes):], []byte(sessionIDBytes))
	}

	// Call settleSession on the contract
	tx, err := s.blockchainClient.SettleSession(ctx, sessionID)
	if err != nil {
		s.logger.Error("failed to settle session",
			zap.String("session_id", sess.ID),
			zap.Error(err))
		return
	}

	// Wait for transaction confirmation
	receipt, err := s.blockchainClient.WaitForTransaction(ctx, tx.Hash())
	if err != nil {
		s.logger.Error("failed to confirm settlement transaction",
			zap.String("session_id", sess.ID),
			zap.String("tx_hash", tx.Hash().Hex()),
			zap.Error(err))
		return
	}

	if receipt.Status == 0 {
		s.logger.Error("settlement transaction failed",
			zap.String("session_id", sess.ID),
			zap.String("tx_hash", tx.Hash().Hex()))
		return
	}

	// Calculate the amount that was settled based on time elapsed
	elapsed := time.Since(sess.LastSettle)
	cost := uint64(elapsed.Seconds()) * sess.Rate / 3600 // Convert to hourly rate

	s.logger.Info("session settled successfully",
		zap.String("session_id", sess.ID),
		zap.String("tx_hash", tx.Hash().Hex()),
		zap.Duration("elapsed", elapsed),
		zap.Uint64("cost", cost))

	// Update cache with settlement info
	if err := s.sessionCache.UpdateSettlement(sess.ID, cost); err != nil {
		s.logger.Error("failed to update session cache",
			zap.String("session_id", sess.ID),
			zap.Error(err))
	}
}

// SettleSessionImmediately settles a specific session immediately
func (s *Scheduler) SettleSessionImmediately(sessionID string) error {
	sess, err := s.sessionCache.Get(sessionID)
	if err != nil {
		return fmt.Errorf("session not found: %w", err)
	}

	if !sess.Active {
		return fmt.Errorf("session is not active")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Convert session ID to bytes32
	var sessionIDBytes32 [32]byte
	sessionIDBytes, err := fmt.Sprintf("%x", sessionID), nil
	if len(sessionIDBytes) >= 64 {
		copy(sessionIDBytes32[:], []byte(sessionIDBytes[:64]))
	} else {
		copy(sessionIDBytes32[:], make([]byte, 64-len(sessionIDBytes)))
		copy(sessionIDBytes32[64-len(sessionIDBytes):], []byte(sessionIDBytes))
	}

	// Call settleSession on the contract
	tx, err := s.blockchainClient.SettleSession(ctx, sessionIDBytes32)
	if err != nil {
		return fmt.Errorf("failed to settle session: %w", err)
	}

	// Wait for transaction confirmation
	receipt, err := s.blockchainClient.WaitForTransaction(ctx, tx.Hash())
	if err != nil {
		return fmt.Errorf("failed to confirm settlement transaction: %w", err)
	}

	if receipt.Status == 0 {
		return fmt.Errorf("settlement transaction failed")
	}

	// Calculate the amount that was settled
	elapsed := time.Since(sess.LastSettle)
	cost := uint64(elapsed.Seconds()) * sess.Rate / 3600

	s.logger.Info("session settled immediately",
		zap.String("session_id", sessionID),
		zap.String("tx_hash", tx.Hash().Hex()),
		zap.Duration("elapsed", elapsed),
		zap.Uint64("cost", cost))

	// Update cache with settlement info
	if err := s.sessionCache.UpdateSettlement(sessionID, cost); err != nil {
		s.logger.Error("failed to update session cache",
			zap.String("session_id", sessionID),
			zap.Error(err))
	}

	return nil
}

// IsRunning returns whether the scheduler is running
func (s *Scheduler) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}