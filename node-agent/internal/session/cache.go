package session

import (
	"fmt"
	"sync"
	"time"

	"go.uber.org/zap"
)

// Session represents an active session
type Session struct {
	ID          string    `json:"id"`
	User        string    `json:"user"`
	NodeID      uint64    `json:"node_id"`
	Rate        uint64    `json:"rate"`
	MaxSpend    uint64    `json:"max_spend"`
	Deposited   uint64    `json:"deposited"`
	Settled     uint64    `json:"settled"`
	StartTime   time.Time `json:"start_time"`
	LastSettle  time.Time `json:"last_settle"`
	Active      bool      `json:"active"`
	PublicKey   string    `json:"public_key"`
	AllowedIPs  []string  `json:"allowed_ips"`
	LastUpdated time.Time `json:"last_updated"`
}

// Cache manages session state
type Cache struct {
	sessions map[string]*Session
	mu       sync.RWMutex
	logger   *zap.Logger
}

// NewCache creates a new session cache
func NewCache(logger *zap.Logger) *Cache {
	return &Cache{
		sessions: make(map[string]*Session),
		logger:   logger,
	}
}

// Add adds a new session to the cache
func (c *Cache) Add(session *Session) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.sessions[session.ID]; exists {
		return fmt.Errorf("session already exists: %s", session.ID)
	}

	session.LastUpdated = time.Now()
	c.sessions[session.ID] = session

	c.logger.Info("added session to cache",
		zap.String("session_id", session.ID),
		zap.String("user", session.User),
		zap.Uint64("node_id", session.NodeID))

	return nil
}

// Get retrieves a session from the cache
func (c *Cache) Get(sessionID string) (*Session, error) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	session, exists := c.sessions[sessionID]
	if !exists {
		return nil, fmt.Errorf("session not found: %s", sessionID)
	}

	return session, nil
}

// Update updates an existing session in the cache
func (c *Cache) Update(session *Session) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.sessions[session.ID]; !exists {
		return fmt.Errorf("session not found: %s", session.ID)
	}

	session.LastUpdated = time.Now()
	c.sessions[session.ID] = session

	c.logger.Debug("updated session in cache",
		zap.String("session_id", session.ID))

	return nil
}

// Remove removes a session from the cache
func (c *Cache) Remove(sessionID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	if _, exists := c.sessions[sessionID]; !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	delete(c.sessions, sessionID)

	c.logger.Info("removed session from cache",
		zap.String("session_id", sessionID))

	return nil
}

// List returns all sessions in the cache
func (c *Cache) List() []*Session {
	c.mu.RLock()
	defer c.mu.RUnlock()

	sessions := make([]*Session, 0, len(c.sessions))
	for _, session := range c.sessions {
		sessions = append(sessions, session)
	}

	return sessions
}

// GetActiveSessions returns all active sessions
func (c *Cache) GetActiveSessions() []*Session {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var active []*Session
	for _, session := range c.sessions {
		if session.Active {
			active = append(active, session)
		}
	}

	return active
}

// GetSessionsNeedingSettlement returns sessions that need settlement
func (c *Cache) GetSessionsNeedingSettlement(settlementInterval time.Duration) []*Session {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var needing []*Session
	now := time.Now()

	for _, session := range c.sessions {
		if session.Active && now.Sub(session.LastSettle) >= settlementInterval {
			needing = append(needing, session)
		}
	}

	return needing
}

// UpdateSettlement updates settlement information for a session
func (c *Cache) UpdateSettlement(sessionID string, settledAmount uint64) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, exists := c.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.Settled += settledAmount
	session.LastSettle = time.Now()
	session.LastUpdated = time.Now()

	// Check if session should be deactivated
	if session.Settled >= session.MaxSpend {
		session.Active = false
	}

	c.logger.Info("updated session settlement",
		zap.String("session_id", sessionID),
		zap.Uint64("settled_amount", settledAmount),
		zap.Uint64("total_settled", session.Settled),
		zap.Bool("active", session.Active))

	return nil
}

// Deactivates deactivates a session
func (c *Cache) Deactivate(sessionID string) error {
	c.mu.Lock()
	defer c.mu.Unlock()

	session, exists := c.sessions[sessionID]
	if !exists {
		return fmt.Errorf("session not found: %s", sessionID)
	}

	session.Active = false
	session.LastUpdated = time.Now()

	c.logger.Info("deactivated session",
		zap.String("session_id", sessionID))

	return nil
}

// Stats returns cache statistics
func (c *Cache) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	stats := CacheStats{
		Total:   len(c.sessions),
		Active:  0,
		Settled: 0,
	}

	for _, session := range c.sessions {
		if session.Active {
			stats.Active++
		}
		if session.Settled > 0 {
			stats.Settled++
		}
	}

	return stats
}

// CacheStats contains cache statistics
type CacheStats struct {
	Total   int `json:"total"`
	Active  int `json:"active"`
	Settled int `json:"settled"`
}