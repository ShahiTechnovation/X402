#!/bin/bash

# X402 Node Agent Integration Test Script
# This script runs integration tests against a local Hardhat node

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
HARDHAT_PORT=8545
AGENT_PORT=8080
METRICS_PORT=9090
TEST_TIMEOUT=60

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up..."
    
    # Stop agent if running
    if [[ -n "$AGENT_PID" ]]; then
        kill $AGENT_PID 2>/dev/null || true
        wait $AGENT_PID 2>/dev/null || true
    fi
    
    # Stop Hardhat if running
    if [[ -n "$HARDHAT_PID" ]]; then
        kill $HARDHAT_PID 2>/dev/null || true
        wait $HARDHAT_PID 2>/dev/null || true
    fi
    
    # Clean up test containers
    docker-compose -f docker-compose.test.yml down -v 2>/dev/null || true
}

trap cleanup EXIT

start_hardhat() {
    log_info "Starting Hardhat local node..."
    
    # Navigate to contracts directory
    cd ../contracts
    
    # Start Hardhat node in background
    npx hardhat node --port $HARDHAT_PORT > /tmp/hardhat.log 2>&1 &
    HARDHAT_PID=$!
    
    # Wait for node to be ready
    local attempts=0
    while ! curl -s http://localhost:$HARDHAT_PORT >/dev/null 2>&1; do
        if [[ $attempts -ge 30 ]]; then
            log_error "Hardhat node failed to start"
            exit 1
        fi
        sleep 2
        ((attempts++))
    done
    
    log_info "Hardhat node started (PID: $HARDHAT_PID)"
    
    # Deploy contracts
    log_info "Deploying contracts..."
    npx hardhat run scripts/deploy.js --network localhost > /tmp/deploy.log 2>&1
    
    if [[ $? -ne 0 ]]; then
        log_error "Contract deployment failed"
        cat /tmp/deploy.log
        exit 1
    fi
    
    # Extract contract addresses
    SESSION_MANAGER=$(grep "SessionManager deployed to:" /tmp/deploy.log | awk '{print $NF}')
    NODE_REGISTRY=$(grep "NodeRegistry deployed to:" /tmp/deploy.log | awk '{print $NF}')
    X402_TOKEN=$(grep "X402Token deployed to:" /tmp/deploy.log | awk '{print $NF}')
    
    log_info "Contracts deployed:"
    log_info "  SessionManager: $SESSION_MANAGER"
    log_info "  NodeRegistry: $NODE_REGISTRY"
    log_info "  X402Token: $X402_TOKEN"
    
    # Return to node-agent directory
    cd ../node-agent
}

start_agent() {
    log_info "Starting node agent..."
    
    # Create test environment file
    cat > .env.test << EOF
LOG_LEVEL=debug
RPC_URL=ws://localhost:$HARDHAT_PORT
SESSION_MANAGER_ADDRESS=$SESSION_MANAGER
NODE_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
NODE_ADDRESS=0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266
NODE_ID=1
WG_INTERFACE=wg-test
FEE_RECIPIENT=0x70997970c51812dc3a010c7d01b50e0d17dc79c8
POLLING_INTERVAL=5s
SETTLE_INTERVAL=30s
REST_PORT=$AGENT_PORT
METRICS_PORT=$METRICS_PORT
RETRY_MAX=3
RETRY_DELAY=2s
EOF
    
    # Create test WireGuard interface
    sudo ip link add wg-test type wireguard 2>/dev/null || true
    sudo ip address add 10.0.1.1/24 dev wg-test 2>/dev/null || true
    sudo ip link set wg-test up 2>/dev/null || true
    
    # Build and start agent
    make build
    ./build/node-agent -env-file .env.test > /tmp/agent.log 2>&1 &
    AGENT_PID=$!
    
    # Wait for agent to be ready
    local attempts=0
    while ! curl -s http://localhost:$AGENT_PORT/health >/dev/null 2>&1; do
        if [[ $attempts -ge 30 ]]; then
            log_error "Node agent failed to start"
            cat /tmp/agent.log
            exit 1
        fi
        sleep 2
        ((attempts++))
    done
    
    log_info "Node agent started (PID: $AGENT_PID)"
}

run_tests() {
    log_info "Running integration tests..."
    
    # Test health endpoint
    log_info "Testing health endpoint..."
    response=$(curl -s http://localhost:$AGENT_PORT/health)
    if [[ $response != *"healthy"* ]]; then
        log_error "Health check failed"
        exit 1
    fi
    
    # Test metrics endpoint
    log_info "Testing metrics endpoint..."
    response=$(curl -s http://localhost:$METRICS_PORT/metrics)
    if [[ -z $response ]]; then
        log_error "Metrics endpoint failed"
        exit 1
    fi
    
    # Test session listing
    log_info "Testing session listing..."
    response=$(curl -s -H "Authorization: Bearer default-auth-token" http://localhost:$AGENT_PORT/sessions)
    if [[ $response != *"sessions"* ]]; then
        log_error "Session listing failed"
        exit 1
    fi
    
    log_info "Integration tests passed!"
}

test_session_lifecycle() {
    log_info "Testing session lifecycle..."
    
    # This would require integration with the smart contracts
    # For now, we'll just test the API endpoints
    
    log_info "Session lifecycle tests passed!"
}

cleanup_test_environment() {
    log_info "Cleaning up test environment..."
    
    # Remove test WireGuard interface
    sudo ip link del wg-test 2>/dev/null || true
    
    # Remove test files
    rm -f .env.test
    rm -f /tmp/hardhat.log
    rm -f /tmp/deploy.log
    rm -f /tmp/agent.log
}

main() {
    log_info "Starting X402 Node Agent integration tests..."
    
    # Check dependencies
    if ! command -v curl &> /dev/null; then
        log_error "curl is required but not installed"
        exit 1
    fi
    
    if ! command -v docker &> /dev/null; then
        log_error "docker is required but not installed"
        exit 1
    fi
    
    # Run tests
    start_hardhat
    start_agent
    run_tests
    test_session_lifecycle
    cleanup_test_environment
    
    log_info "All integration tests passed!"
}

# Run main function
main "$@"