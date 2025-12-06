package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"go.uber.org/zap"

	"github.com/x402/node-agent/internal/session"
	"github.com/x402/node-agent/internal/wireguard"
)

// Server represents the REST API server
type Server struct {
	port          int
	sessionCache  *session.Cache
	wgManager     *wireguard.WireGuardManager
	logger        *zap.Logger
	authToken     string
}

// NewServer creates a new API server
func NewServer(port int, sessionCache *session.Cache, wgManager *wireguard.WireGuardManager, authToken string, logger *zap.Logger) *Server {
	return &Server{
		port:         port,
		sessionCache: sessionCache,
		wgManager:    wgManager,
		logger:       logger,
		authToken:    authToken,
	}
}

// Start starts the API server
func (s *Server) Start() error {
	router := mux.NewRouter()
	
	// Apply authentication middleware to all routes
	router.Use(s.authMiddleware)

	// Register routes
	router.HandleFunc("/health", s.handleHealth).Methods("GET")
	router.HandleFunc("/metrics", s.handleMetrics).Methods("GET")
	router.HandleFunc("/sessions", s.handleListSessions).Methods("GET")
	router.HandleFunc("/session/{id}", s.handleGetSession).Methods("GET")
	router.HandleFunc("/session/{id}/config", s.handleGetSessionConfig).Methods("GET")
	router.HandleFunc("/session/{id}/status", s.handleGetSessionStatus).Methods("GET")

	addr := fmt.Sprintf(":%d", s.port)
	s.logger.Info("starting API server", zap.Int("port", s.port))

	return http.ListenAndServe(addr, router)
}

// authMiddleware validates the authentication token
func (s *Server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip auth for health endpoint
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			s.writeError(w, http.StatusUnauthorized, "missing authorization header")
			return
		}

		// Expect "Bearer <token>"
		parts := strings.Split(authHeader, " ")
		if len(parts) != 2 || parts[0] != "Bearer" {
			s.writeError(w, http.StatusUnauthorized, "invalid authorization header format")
			return
		}

		if parts[1] != s.authToken {
			s.writeError(w, http.StatusUnauthorized, "invalid authorization token")
			return
		}

		next.ServeHTTP(w, r)
	})
}

// handleHealth handles health check requests
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	s.writeJSON(w, http.StatusOK, map[string]string{
		"status": "healthy",
	})
}

// handleMetrics handles metrics requests
func (s *Server) handleMetrics(w http.ResponseWriter, r *http.Request) {
	stats := s.sessionCache.Stats()
	peers := s.wgManager.ListPeers()

	metrics := map[string]interface{}{
		"cache_stats": stats,
		"peer_count":  len(peers),
		"uptime":      "TODO: implement uptime tracking",
	}

	s.writeJSON(w, http.StatusOK, metrics)
}

// handleListSessions handles listing all sessions
func (s *Server) handleListSessions(w http.ResponseWriter, r *http.Request) {
	sessions := s.sessionCache.List()
	s.writeJSON(w, http.StatusOK, map[string]interface{}{
		"sessions": sessions,
		"count":    len(sessions),
	})
}

// handleGetSession handles getting a specific session
func (s *Server) handleGetSession(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	session, err := s.sessionCache.Get(sessionID)
	if err != nil {
		s.writeError(w, http.StatusNotFound, fmt.Sprintf("session not found: %s", sessionID))
		return
	}

	s.writeJSON(w, http.StatusOK, session)
}

// handleGetSessionConfig handles getting WireGuard config for a session
func (s *Server) handleGetSessionConfig(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	// Get session
	session, err := s.sessionCache.Get(sessionID)
	if err != nil {
		s.writeError(w, http.StatusNotFound, fmt.Sprintf("session not found: %s", sessionID))
		return
	}

	if !session.Active {
		s.writeError(w, http.StatusBadRequest, "session is not active")
		return
	}

	if session.PublicKey == "" {
		s.writeError(w, http.StatusNotFound, "no WireGuard peer for this session")
		return
	}

	// Generate WireGuard configuration
	config, err := s.wgManager.GenerateConfig(session.PublicKey)
	if err != nil {
		s.logger.Error("failed to generate WireGuard config", 
			zap.String("session_id", sessionID), 
			zap.Error(err))
		s.writeError(w, http.StatusInternalServerError, "failed to generate configuration")
		return
	}

	// Set content type to text/plain for better client experience
	w.Header().Set("Content-Type", "text/plain")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(config))
}

// handleGetSessionStatus handles getting session status
func (s *Server) handleGetSessionStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	sessionID := vars["id"]

	// Get session
	session, err := s.sessionCache.Get(sessionID)
	if err != nil {
		s.writeError(w, http.StatusNotFound, fmt.Sprintf("session not found: %s", sessionID))
		return
	}

	// Get WireGuard peer info
	var peerInfo *wireguard.PeerMetadata
	if session.PublicKey != "" {
		peerInfo, _ = s.wgManager.GetPeer(session.PublicKey)
	}

	status := map[string]interface{}{
		"session": session,
		"peer":    peerInfo,
	}

	s.writeJSON(w, http.StatusOK, status)
}

// writeJSON writes a JSON response
func (s *Server) writeJSON(w http.ResponseWriter, statusCode int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		s.logger.Error("failed to encode JSON response", zap.Error(err))
	}
}

// writeError writes an error response
func (s *Server) writeError(w http.ResponseWriter, statusCode int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	errorResp := map[string]interface{}{
		"error":  message,
		"status": statusCode,
	}

	if err := json.NewEncoder(w).Encode(errorResp); err != nil {
		s.logger.Error("failed to encode error response", zap.Error(err))
	}
}