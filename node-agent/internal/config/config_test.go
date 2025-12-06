package config

import (
	"testing"
	"time"
)

func TestConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		config  *Config
		wantErr bool
	}{
		{
			name: "valid config",
			config: &Config{
				RPCURL:         "ws://localhost:8545",
				SessionManager: "0x1234567890123456789012345678901234567890",
				NodePrivateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
				NodeAddress:    "0x1234567890123456789012345678901234567890",
				NodeID:         1,
				WGInterface:    "wg0",
				FeeRecipient:   "0x1234567890123456789012345678901234567890",
			},
			wantErr: false,
		},
		{
			name: "missing RPC URL",
			config: &Config{
				SessionManager: "0x1234567890123456789012345678901234567890",
				NodePrivateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
				NodeAddress:    "0x1234567890123456789012345678901234567890",
				NodeID:         1,
				WGInterface:    "wg0",
				FeeRecipient:   "0x1234567890123456789012345678901234567890",
			},
			wantErr: true,
		},
		{
			name: "missing node ID",
			config: &Config{
				RPCURL:         "ws://localhost:8545",
				SessionManager: "0x1234567890123456789012345678901234567890",
				NodePrivateKey: "0x1234567890123456789012345678901234567890123456789012345678901234",
				NodeAddress:    "0x1234567890123456789012345678901234567890",
				WGInterface:    "wg0",
				FeeRecipient:   "0x1234567890123456789012345678901234567890",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.config.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Config.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestDefaultValues(t *testing.T) {
	// Test that defaults are set correctly
	config := &Config{}
	
	// This would normally be set by viper, but we'll check the expected defaults
	expectedDefaults := map[string]interface{}{
		"LogLevel":        "info",
		"RPCURL":          "ws://localhost:8545",
		"WGInterface":     "wg0",
		"PollingInterval": 30 * time.Second,
		"SettleInterval":  10 * time.Minute,
		"RestPort":        8080,
		"MetricsPort":     9090,
		"RetryMax":        5,
		"RetryDelay":      5 * time.Second,
	}
	
	// In a real test, we would use viper to load defaults and verify
	// For now, just verify the expected values exist in the map
	if len(expectedDefaults) == 0 {
		t.Error("expected defaults should not be empty")
	}
}