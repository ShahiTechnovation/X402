package session

import (
	"testing"
	"time"

	"go.uber.org/zap/zaptest"
)

func TestSessionCache(t *testing.T) {
	logger := zaptest.NewLogger(t)
	cache := NewCache(logger)

	// Test adding session
	session := &Session{
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
		AllowedIPs: []string{"10.0.0.1/32"},
	}

	err := cache.Add(session)
	if err != nil {
		t.Fatalf("Failed to add session: %v", err)
	}

	// Test getting session
	retrieved, err := cache.Get("test-session-1")
	if err != nil {
		t.Fatalf("Failed to get session: %v", err)
	}

	if retrieved.ID != session.ID {
		t.Errorf("Expected session ID '%s', got '%s'", session.ID, retrieved.ID)
	}

	// Test updating session
	retrieved.Settled = 1000
	err = cache.Update(retrieved)
	if err != nil {
		t.Fatalf("Failed to update session: %v", err)
	}

	retrieved, err = cache.Get("test-session-1")
	if err != nil {
		t.Fatalf("Failed to get updated session: %v", err)
	}

	if retrieved.Settled != 1000 {
		t.Errorf("Expected settled amount 1000, got %d", retrieved.Settled)
	}

	// Test listing sessions
	sessions := cache.List()
	if len(sessions) != 1 {
		t.Errorf("Expected 1 session, got %d", len(sessions))
	}

	// Test getting active sessions
	activeSessions := cache.GetActiveSessions()
	if len(activeSessions) != 1 {
		t.Errorf("Expected 1 active session, got %d", len(activeSessions))
	}

	// Test deactivating session
	err = cache.Deactivate("test-session-1")
	if err != nil {
		t.Fatalf("Failed to deactivate session: %v", err)
	}

	activeSessions = cache.GetActiveSessions()
	if len(activeSessions) != 0 {
		t.Errorf("Expected 0 active sessions, got %d", len(activeSessions))
	}

	// Test removing session
	err = cache.Remove("test-session-1")
	if err != nil {
		t.Fatalf("Failed to remove session: %v", err)
	}

	_, err = cache.Get("test-session-1")
	if err == nil {
		t.Error("Expected error when getting removed session")
	}
}

func TestSessionCacheStats(t *testing.T) {
	logger := zaptest.NewLogger(t)
	cache := NewCache(logger)

	// Add some sessions
	session1 := &Session{
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

	session2 := &Session{
		ID:         "test-session-2",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    1000,
		StartTime:  time.Now(),
		LastSettle: time.Now(),
		Active:     true,
	}

	cache.Add(session1)
	cache.Add(session2)

	stats := cache.Stats()
	if stats.Total != 2 {
		t.Errorf("Expected 2 total sessions, got %d", stats.Total)
	}

	if stats.Active != 2 {
		t.Errorf("Expected 2 active sessions, got %d", stats.Active)
	}

	if stats.Settled != 1 {
		t.Errorf("Expected 1 settled session, got %d", stats.Settled)
	}
}

func TestSettlementUpdate(t *testing.T) {
	logger := zaptest.NewLogger(t)
	cache := NewCache(logger)

	session := &Session{
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

	cache.Add(session)

	// Update settlement
	err := cache.UpdateSettlement("test-session-1", 1000)
	if err != nil {
		t.Fatalf("Failed to update settlement: %v", err)
	}

	retrieved, err := cache.Get("test-session-1")
	if err != nil {
		t.Fatalf("Failed to get session: %v", err)
	}

	if retrieved.Settled != 1000 {
		t.Errorf("Expected settled amount 1000, got %d", retrieved.Settled)
	}

	// Update settlement to reach max spend
	err = cache.UpdateSettlement("test-session-1", 9000)
	if err != nil {
		t.Fatalf("Failed to update settlement: %v", err)
	}

	retrieved, err = cache.Get("test-session-1")
	if err != nil {
		t.Fatalf("Failed to get session: %v", err)
	}

	if retrieved.Settled != 10000 {
		t.Errorf("Expected settled amount 10000, got %d", retrieved.Settled)
	}

	if retrieved.Active {
		t.Error("Expected session to be deactivated when max spend is reached")
	}
}

func TestGetSessionsNeedingSettlement(t *testing.T) {
	logger := zaptest.NewLogger(t)
	cache := NewCache(logger)

	// Add sessions with different last settle times
	now := time.Now()
	
	session1 := &Session{
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

	session2 := &Session{
		ID:         "test-session-2",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    0,
		StartTime:  now.Add(-2 * time.Hour),
		LastSettle: now.Now(),
		Active:     true,
	}

	session3 := &Session{
		ID:         "test-session-3",
		User:       "0x1234567890123456789012345678901234567890",
		NodeID:     1,
		Rate:       1000,
		MaxSpend:   10000,
		Deposited:  5000,
		Settled:    0,
		StartTime:  now.Add(-2 * time.Hour),
		LastSettle: now.Now(),
		Active:     false,
	}

	cache.Add(session1)
	cache.Add(session2)
	cache.Add(session3)

	// Check for sessions needing settlement (30 minutes interval)
	settlementInterval := 30 * time.Minute
	needing := cache.GetSessionsNeedingSettlement(settlementInterval)
	
	if len(needing) != 1 {
		t.Errorf("Expected 1 session needing settlement, got %d", len(needing))
	}

	if needing[0].ID != "test-session-1" {
		t.Errorf("Expected session 'test-session-1' to need settlement, got '%s'", needing[0].ID)
	}
}