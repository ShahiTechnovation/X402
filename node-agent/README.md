# X402 Node Agent

A production-grade node agent for the X402 protocol that manages compute node sessions, WireGuard peers, and automated settlement.

## Features

- **Blockchain Integration**: Connects to Ethereum L2 via WebSocket for real-time event monitoring
- **WireGuard Management**: Dynamic peer provisioning and configuration generation
- **Session Cache**: In-memory session state management with metadata tracking
- **Automated Settlement**: Periodic and immediate session settlement with retry logic
- **REST API**: Authenticated endpoints for session management and config retrieval
- **Monitoring**: Prometheus metrics and health endpoints
- **Robust Error Handling**: Exponential backoff, panic recovery, and graceful shutdown
- **Production Ready**: systemd service, Docker containerization, and comprehensive logging

## Quick Start

### Prerequisites

- Go 1.21 or later
- WireGuard tools (`wg`, `wg-quick`)
- Linux kernel with WireGuard support
- Access to an Ethereum L2 node (WebSocket)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/x402/node-agent.git
cd node-agent
```

2. Install dependencies:
```bash
make deps
```

3. Copy and configure environment:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Build and run:
```bash
make run
```

### Docker Deployment

1. Build the Docker image:
```bash
make docker
```

2. Run with Docker Compose:
```bash
# Copy and edit .env file
cp .env.example .env
# Edit with your configuration

# Start services
docker-compose up -d

# View logs
docker-compose logs -f node-agent
```

### systemd Service

1. Install the binary:
```bash
sudo make install
```

2. Create service user and directories:
```bash
sudo useradd -r -s /bin/false nodeagent
sudo mkdir -p /opt/x402/node-agent
sudo cp node-agent /opt/x402/node-agent/
sudo cp .env /opt/x402/node-agent/
sudo chown -R nodeagent:nodeagent /opt/x402/node-agent
```

3. Install and enable the service:
```bash
sudo cp node-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable node-agent
sudo systemctl start node-agent
```

## Configuration

The agent is configured via environment variables. See `.env.example` for all available options.

### Required Variables

- `RPC_URL`: WebSocket RPC URL for the Ethereum node
- `SESSION_MANAGER_ADDRESS`: Address of the SessionManager contract
- `NODE_PRIVATE_KEY`: Private key of the node operator
- `NODE_ADDRESS`: Derived address of the node operator
- `NODE_ID`: Node ID registered in NodeRegistry
- `FEE_RECIPIENT`: Address to receive protocol fees

### Optional Variables

- `LOG_LEVEL`: Logging level (debug, info, warn, error) [default: info]
- `WG_INTERFACE`: WireGuard interface name [default: wg0]
- `POLLING_INTERVAL`: Event polling interval [default: 30s]
- `SETTLE_INTERVAL`: Settlement batch interval [default: 10m]
- `REST_PORT`: REST API port [default: 8080]
- `METRICS_PORT`: Metrics endpoint port [default: 9090]
- `RETRY_MAX`: Maximum retry attempts [default: 5]
- `RETRY_DELAY`: Initial retry delay [default: 5s]

## API Endpoints

All endpoints except `/health` require authentication via `Authorization: Bearer <token>` header.

### Health & Metrics
- `GET /health` - Health check (no auth required)
- `GET /metrics` - Prometheus metrics

### Session Management
- `GET /sessions` - List all sessions
- `GET /session/{id}` - Get specific session details
- `GET /session/{id}/config` - Get WireGuard configuration for session
- `GET /session/{id}/status` - Get session status with peer info

### Example Usage

```bash
# Health check
curl http://localhost:8080/health

# Get session config (with auth)
curl -H "Authorization: Bearer default-auth-token" \
     http://localhost:8080/session/0x123.../config

# List sessions (with auth)
curl -H "Authorization: Bearer default-auth-token" \
     http://localhost:8080/sessions
```

## WireGuard Integration

The agent automatically manages WireGuard peers based on session events:

1. **Session Started**: Creates a new WireGuard peer with allocated IP
2. **Session Active**: Monitors peer handshakes and connectivity
3. **Session Stopped**: Removes the WireGuard peer and cleans up resources

### IP Allocation

Peers are allocated IPs from a configurable subnet (default: 10.0.0.0/24). Each session gets a unique `/32` IP address.

### Configuration Generation

The agent generates client WireGuard configurations on-demand via the `/session/{id}/config` endpoint.

## Development

### Building

```bash
# Development build
make dev

# Production build
make build

# Cross-platform builds
make build-linux
make build-windows
make build-mac
```

### Testing

```bash
# Run all tests
make test

# Run with coverage
make test-coverage

# Run benchmarks
make bench
```

### Code Quality

```bash
# Format code
make fmt

# Lint code
make lint

# Security scan
make sec
```

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Blockchain    │    │   Session Cache  │    │  WireGuard Mgr  │
│   Events        │───▶│   (in-memory)    │───▶│   Peers/Config  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Settlement      │    │   REST API       │    │   Metrics       │
│ Scheduler       │    │   Server         │    │   Endpoint      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Components

- **Blockchain Client**: Ethereum WebSocket client with event subscription
- **Session Cache**: Thread-safe in-memory session state management
- **WireGuard Manager**: Dynamic peer provisioning via `wgctrl`
- **Settlement Scheduler**: Automated periodic and immediate settlement
- **API Server**: RESTful HTTP API with authentication
- **Configuration**: Environment-based configuration with validation

## Monitoring

### Metrics

The agent exposes Prometheus metrics on port 9090:

- `cache_sessions_total`: Total number of sessions in cache
- `cache_sessions_active`: Number of active sessions
- `wireguard_peers_total`: Number of WireGuard peers
- `settlement_transactions_total`: Total settlement transactions
- `settlement_errors_total`: Total settlement errors

### Health Checks

- `/health` endpoint returns service health status
- Docker health check monitors API availability
- systemd service monitors process health

### Logging

Structured JSON logging with configurable levels:
- `debug`: Detailed debugging information
- `info`: General operational information
- `warn`: Warning conditions
- `error`: Error conditions

## Security

### Authentication

- API endpoints protected by Bearer token authentication
- Configurable auth token (default: `default-auth-token`)
- Rate limiting and request validation

### Permissions

- Runs as non-root user `nodeagent`
- Minimal capabilities: `CAP_NET_ADMIN`, `CAP_NET_RAW`
- File system isolation with `ProtectSystem=strict`

### Network Security

- WireGuard provides encrypted tunneling
- Configurable firewall rules recommended
- TLS termination at reverse proxy level

## Troubleshooting

### Common Issues

1. **WireGuard Interface Not Found**
   ```bash
   sudo ip link add wg0 type wireguard
   sudo ip address add 10.0.0.1/24 dev wg0
   sudo ip link set wg0 up
   ```

2. **Permission Denied**
   ```bash
   sudo usermod -a -G nodeagent $USER
   # Add user to wireguard group if needed
   sudo usermod -a -G wireguard nodeagent
   ```

3. **Connection Refused**
   - Check RPC URL is accessible
   - Verify WebSocket endpoint is working
   - Check firewall settings

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug ./node-agent
```

### Logs

View logs via systemd journal:
```bash
sudo journalctl -u node-agent -f
```

Or Docker logs:
```bash
docker-compose logs -f node-agent
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Run `make test lint fmt`
6. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Create an issue on GitHub for bug reports
- Join our Discord for community support
- Check documentation for common questions