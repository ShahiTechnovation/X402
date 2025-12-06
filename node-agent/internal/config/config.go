package config

import (
	"fmt"
	"os"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	LogLevel        string        `mapstructure:"LOG_LEVEL"`
	RPCURL          string        `mapstructure:"RPC_URL"`
	SessionManager  string        `mapstructure:"SESSION_MANAGER_ADDRESS"`
	NodePrivateKey  string        `mapstructure:"NODE_PRIVATE_KEY"`
	NodeAddress     string        `mapstructure:"NODE_ADDRESS"`
	NodeID          uint64        `mapstructure:"NODE_ID"`
	WGInterface     string        `mapstructure:"WG_INTERFACE"`
	FeeRecipient    string        `mapstructure:"FEE_RECIPIENT"`
	PollingInterval time.Duration `mapstructure:"POLLING_INTERVAL"`
	SettleInterval  time.Duration `mapstructure:"SETTLE_INTERVAL"`
	RestPort        int           `mapstructure:"REST_PORT"`
	MetricsPort     int           `mapstructure:"METRICS_PORT"`
	RetryMax        int           `mapstructure:"RETRY_MAX"`
	RetryDelay      time.Duration `mapstructure:"RETRY_DELAY"`
}

func Load() (*Config, error) {
	viper.SetConfigName(".env")
	viper.SetConfigType("env")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./node-agent")

	// Set defaults
	viper.SetDefault("LOG_LEVEL", "info")
	viper.SetDefault("RPC_URL", "ws://localhost:8545")
	viper.SetDefault("WG_INTERFACE", "wg0")
	viper.SetDefault("POLLING_INTERVAL", "30s")
	viper.SetDefault("SETTLE_INTERVAL", "10m")
	viper.SetDefault("REST_PORT", 8080)
	viper.SetDefault("METRICS_PORT", 9090)
	viper.SetDefault("RETRY_MAX", 5)
	viper.SetDefault("RETRY_DELAY", "5s")

	// Bind environment variables
	viper.AutomaticEnv()
	viper.SetEnvPrefix("NODE_AGENT")

	// Read from .env file if exists
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config file: %w", err)
		}
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, fmt.Errorf("unable to decode config: %w", err)
	}

	// Validate required fields
	if config.SessionManager == "" {
		return nil, fmt.Errorf("SESSION_MANAGER_ADDRESS is required")
	}
	if config.NodePrivateKey == "" {
		return nil, fmt.Errorf("NODE_PRIVATE_KEY is required")
	}
	if config.NodeAddress == "" {
		return nil, fmt.Errorf("NODE_ADDRESS is required")
	}
	if config.NodeID == 0 {
		return nil, fmt.Errorf("NODE_ID is required")
	}
	if config.FeeRecipient == "" {
		return nil, fmt.Errorf("FEE_RECIPIENT is required")
	}

	return &config, nil
}

func (c *Config) Validate() error {
	if c.RPCURL == "" {
		return fmt.Errorf("RPC_URL cannot be empty")
	}
	if c.SessionManager == "" {
		return fmt.Errorf("SessionManager address cannot be empty")
	}
	if c.NodePrivateKey == "" {
		return fmt.Errorf("node private key cannot be empty")
	}
	if c.NodeAddress == "" {
		return fmt.Errorf("node address cannot be empty")
	}
	if c.NodeID == 0 {
		return fmt.Errorf("node ID must be greater than 0")
	}
	if c.WGInterface == "" {
		return fmt.Errorf("WireGuard interface cannot be empty")
	}
	if c.FeeRecipient == "" {
		return fmt.Errorf("fee recipient cannot be empty")
	}
	return nil
}

func PrintUsage() {
	fmt.Printf(`Usage: node-agent [options]

Environment Variables:
  LOG_LEVEL                Log level (debug, info, warn, error) [default: info]
  RPC_URL                  WebSocket RPC URL [default: ws://localhost:8545]
  SESSION_MANAGER_ADDRESS  SessionManager contract address
  NODE_PRIVATE_KEY         Node operator private key
  NODE_ADDRESS             Node operator address (derived from private key)
  NODE_ID                  Node ID registered in NodeRegistry
  WG_INTERFACE             WireGuard interface name [default: wg0]
  FEE_RECIPIENT            Protocol fee recipient address
  POLLING_INTERVAL         Event polling interval [default: 30s]
  SETTLE_INTERVAL          Settlement batch interval [default: 10m]
  REST_PORT                REST API port [default: 8080]
  METRICS_PORT             Metrics endpoint port [default: 9090]
  RETRY_MAX                Maximum retry attempts [default: 5]
  RETRY_DELAY              Initial retry delay [default: 5s]

Flags:
  -h, --help               Show this help message
`)
	os.Exit(0)
}