#!/bin/bash

# X402 Node Agent Setup Script
# This script sets up the node agent for production deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
NODE_AGENT_USER="nodeagent"
NODE_AGENT_DIR="/opt/x402/node-agent"
SERVICE_NAME="node-agent"

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

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

install_dependencies() {
    log_info "Installing dependencies..."
    
    # Update package list
    apt-get update
    
    # Install required packages
    apt-get install -y \
        wireguard \
        wireguard-tools \
        curl \
        wget \
        ca-certificates \
        gnupg \
        lsb-release
    
    log_info "Dependencies installed successfully"
}

create_user() {
    log_info "Creating node agent user..."
    
    if ! id "$NODE_AGENT_USER" &>/dev/null; then
        useradd -r -s /bin/false -d "$NODE_AGENT_DIR" "$NODE_AGENT_USER"
        log_info "User $NODE_AGENT_USER created"
    else
        log_warn "User $NODE_AGENT_USER already exists"
    fi
}

create_directories() {
    log_info "Creating directories..."
    
    mkdir -p "$NODE_AGENT_DIR"
    mkdir -p "$NODE_AGENT_DIR/logs"
    mkdir -p "$NODE_AGENT_DIR/config"
    
    log_info "Directories created"
}

install_binary() {
    log_info "Installing node agent binary..."
    
    # Check if binary exists in current directory
    if [[ ! -f "node-agent" ]]; then
        log_error "Binary not found. Please build the binary first with 'make build'"
        exit 1
    fi
    
    # Copy binary
    cp node-agent "$NODE_AGENT_DIR/"
    chmod +x "$NODE_AGENT_DIR/node-agent"
    
    log_info "Binary installed"
}

setup_config() {
    log_info "Setting up configuration..."
    
    if [[ ! -f "$NODE_AGENT_DIR/.env" ]]; then
        if [[ -f ".env" ]]; then
            cp .env "$NODE_AGENT_DIR/"
        else
            cp .env.example "$NODE_AGENT_DIR/.env"
            log_warn "Please edit $NODE_AGENT_DIR/.env with your configuration"
        fi
    else
        log_warn "Configuration file already exists"
    fi
    
    # Set ownership
    chown -R "$NODE_AGENT_USER:$NODE_AGENT_USER" "$NODE_AGENT_DIR"
    chmod 600 "$NODE_AGENT_DIR/.env"
    
    log_info "Configuration setup completed"
}

setup_wireguard() {
    log_info "Setting up WireGuard..."
    
    # Create WireGuard interface if it doesn't exist
    if ! ip link show wg0 &>/dev/null; then
        log_info "Creating WireGuard interface wg0"
        ip link add wg0 type wireguard
        ip address add 10.0.0.1/24 dev wg0
        ip link set wg0 up
        
        # Generate WireGuard key pair
        wg genkey | tee "$NODE_AGENT_DIR/config/wg-private.key" | wg pubkey > "$NODE_AGENT_DIR/config/wg-public.key"
        
        # Set private key on interface
        wg set wg0 private-key "$NODE_AGENT_DIR/config/wg-private.key"
        
        log_info "WireGuard interface created"
    else
        log_warn "WireGuard interface wg0 already exists"
    fi
    
    # Set ownership
    chown -R "$NODE_AGENT_USER:$NODE_AGENT_USER" "$NODE_AGENT_DIR/config"
    chmod 600 "$NODE_AGENT_DIR/config/wg-private.key"
    chmod 644 "$NODE_AGENT_DIR/config/wg-public.key"
}

install_systemd_service() {
    log_info "Installing systemd service..."
    
    # Copy service file
    cp node-agent.service /etc/systemd/system/
    
    # Reload systemd
    systemctl daemon-reload
    
    # Enable service
    systemctl enable "$SERVICE_NAME"
    
    log_info "Systemd service installed and enabled"
}

setup_firewall() {
    log_info "Setting up firewall rules..."
    
    # Check if ufw is installed
    if command -v ufw &> /dev/null; then
        # Allow WireGuard port
        ufw allow 51820/udp comment "WireGuard"
        
        # Allow API and metrics ports
        ufw allow 8080/tcp comment "Node Agent API"
        ufw allow 9090/tcp comment "Node Agent Metrics"
        
        log_info "UFW firewall rules configured"
    else
        log_warn "UFW not found. Please configure firewall manually"
    fi
}

verify_installation() {
    log_info "Verifying installation..."
    
    # Check if binary is executable
    if [[ ! -x "$NODE_AGENT_DIR/node-agent" ]]; then
        log_error "Binary is not executable"
        exit 1
    fi
    
    # Check if config exists
    if [[ ! -f "$NODE_AGENT_DIR/.env" ]]; then
        log_error "Configuration file not found"
        exit 1
    fi
    
    # Check if service is enabled
    if ! systemctl is-enabled "$SERVICE_NAME" &>/dev/null; then
        log_error "Service is not enabled"
        exit 1
    fi
    
    log_info "Installation verification completed successfully"
}

main() {
    log_info "Starting X402 Node Agent setup..."
    
    check_root
    install_dependencies
    create_user
    create_directories
    install_binary
    setup_config
    setup_wireguard
    install_systemd_service
    setup_firewall
    verify_installation
    
    log_info "Setup completed successfully!"
    log_info ""
    log_info "Next steps:"
    log_info "1. Edit $NODE_AGENT_DIR/.env with your configuration"
    log_info "2. Start the service: systemctl start $SERVICE_NAME"
    log_info "3. Check status: systemctl status $SERVICE_NAME"
    log_info "4. View logs: journalctl -u $SERVICE_NAME -f"
    log_info ""
    log_info "API will be available at: http://localhost:8080"
    log_info "Metrics at: http://localhost:9090"
}

# Run main function
main "$@"