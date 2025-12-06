package settlement

import (
	"context"
	"errors"
	"math/big"
	"testing"
	"time"

	"github.com/ethereum/go-ethereum/core/types"
	"go.uber.org/zap/zaptest"

	"github.com/x402/node-agent/internal/session"
)

// MockBlockchainClient for testing
type MockBlockchainClient struct {
	settleSessionFunc func(ctx context.Context, sessionID [32]byte) (*types.Transaction, error)
	waitForTxFunc     func(ctx context.Context, txHash common.Hash) (*types.Receipt, error)
}

func (m *MockBlockchainClient) SettleSession(ctx context.Context, sessionID [32]byte) (*types.Transaction, error) {
	if m.settleSessionFunc != nil {
		return m.settleSessionFunc(ctx, sessionID)
	}
	return &types.Transaction{}, nil
}

func (m *MockBlockchainClient) WaitForTransaction(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
	if m.waitForTxFunc != nil {
		return m.waitForTxFunc(ctx, txHash)
	}
	return &types.Receipt{Status: 1}, nil
}

func (m *MockBlockchainClient) Close() {
	// Mock implementation
}

func TestSchedulerStartStop(t *testing.T) {
	logger := zaptest.NewLogger(t)
	sessionCache := session.NewCache(logger)
	mockClient := &MockBlockchainClient{}
	
	scheduler := NewScheduler(sessionCache, mockClient, 10*time.Minute, logger)

	// Test initial state
	if scheduler.IsRunning() {
		t.Error("Scheduler should not be running initially")
	}

	// Test start
	scheduler.Start()
	if !scheduler.IsRunning() {
		t.Error("Scheduler should be running after start")
	}

	// Test stop
	scheduler.Stop()
	if scheduler.IsRunning() {
		t.Error("Scheduler should not be running after stop")
	}
}

func TestSettleSingleSession(t *testing.T) {
	logger := zaptest.NewLogger(t)
	sessionCache := session.NewCache(logger)
	
	// Mock successful settlement
	mockClient := &MockBlockchainClient{
		settleSessionFunc: func(ctx context.Context, sessionID [32]byte) (*types.Transaction, error) {
			return &types.Transaction{}, nil
		},
		waitForTxFunc: func(ctx context.Context, txHash common.Hash) (*types.Receipt, error) {
			return &types.Receipt{Status: 1}, nil
		},
	}
	
	scheduler := NewScheduler(sessionCache, mockClient, 10*time.Minute, logger)

	// Add a session
	now := time.Now()
	sess := &session.Session{
		ID:         "test-session-1",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    0,
		StartTime:  now.Add(-2 * time.Hour),
		LastSettle: now.Add(-1 * time.Hour),
		Active:     true,
	}

	err := sessionCache.Add(sess)
	if err != nil {
		t.Fatalf("Failed to add session: %v", err)
	}

	// Settle the session
	err = scheduler.SettleSessionImmediately("test-session-1")
	if err != nil {
		t.Errorf("Expected successful settlement, got error: %v", err)
	}

	// Verify settlement was updated
	updated, err := sessionCache.Get("test-session-1")
	if err != nil {
		t.Fatalf("Failed to get session: %v", err)
	}

	if updated.Settled == 0 {
		t.Error("Expected settlement amount to be greater than 0")
	}
}

func TestSettleSessionFailure(t *testing.T) {
	logger := zaptest.NewLogger(t)
	sessionCache := session.NewCache(logger)
	
	// Mock failed settlement
	mockClient := &MockBlockchainClient{
		settleSessionFunc: func(ctx context.Context, sessionID [32]byte) (*types.Transaction, error) {
			return nil, errors.New("settlement failed")
		},
	}
	
	scheduler := NewScheduler(sessionCache, mockClient, 10*time.Minute, logger)

	// Add a session
	sess := &session.Session{
		ID:         "test-session-1",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    0,
		StartTime:  time.Now(),
		LastSettle: time.Now(),
		Active:     true,
	}

	err := sessionCache.Add(sess)
	if err != nil {
		t.Fatalf("Failed to add session: %v", err)
	}

	// Try to settle the session
	err = scheduler.SettleSessionImmediately("test-session-1")
	if err == nil {
		t.Error("Expected settlement to fail")
	}

	if !errors.Is(err, errors.New("settlement failed")) {
		t.Errorf("Expected specific error message, got: %v", err)
	}
}

func TestSettleNonExistentSession(t *testing.T) {
	logger := zaptest.NewLogger(t)
	sessionCache := session.NewCache(logger)
	mockClient := &MockBlockchainClient{}
	
	scheduler := NewScheduler(sessionCache, mockClient, 10*time.Minute, logger)

	// Try to settle a non-existent session
	err := scheduler.SettleSessionImmediately("non-existent-session")
	if err == nil {
		t.Error("Expected error for non-existent session")
	}

	if !errors.Is(err, errors.New("session not found")) {
		t.Errorf("Expected specific error message, got: %v", err)
	}
}

func TestSettleInactiveSession(t *testing.T) {
	logger := zaptest.NewLogger(t)
	sessionCache := session.NewCache(logger)
	mockClient := &MockBlockchainClient{}
	
	scheduler := NewScheduler(sessionCache, mockClient, 10*time.Minute, logger)

	// Add an inactive session
	sess := &session.Session{
		ID:         "test-session-1",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    0,
		StartTime:  time.Now(),
		LastSettle: time.Now(),
		Active:     false,
	}

	err := sessionCache.Add(sess)
	if err != nil {
		t.Fatalf("Failed to add session: %v", err)
	}

	// Try to settle the inactive session
	err = scheduler.SettleSessionImmediately("test-session-1")
	if err == nil {
		t.Error("Expected error for inactive session")
	}

	if !errors.Is(err, errors.New("session is not active")) {
		t.Errorf("Expected specific error message, got: %v", err)
	}
}
