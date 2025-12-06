# API Integration Guide

This document describes the integration points with external services and smart contracts.

## Smart Contracts (Base Sepolia)

### SessionManager Contract

Manages VPN sessions and token deposits/withdrawals.

#### Methods to implement:

```solidity
function startSession(address nodeAddress, uint256 amount) external returns (bytes32 sessionId)
function stopSession(bytes32 sessionId) external returns (bool)
function getUserBalance(address user) external view returns (uint256)
function getSessionStatus(bytes32 sessionId) external view returns (bool isActive, uint256 elapsedTime, uint256 spend)
```

### x402 Token (ERC20)

VPN service payment token on Base Sepolia.

#### Methods to use:

```solidity
function balanceOf(address account) external view returns (uint256)
function approve(address spender, uint256 amount) external returns (bool)
function transfer(address recipient, uint256 amount) external returns (bool)
function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)
```

## Node REST API

Each VPN node exposes HTTP endpoints for client integration.

### Health Check
```
GET http://{node_address}:8080/api/health
Response: { "status": "healthy", "timestamp": "2024-01-01T00:00:00Z" }
```

### Latency Probe
```
GET http://{node_address}:8080/api/ping
Response: { "pong": true, "timestamp": "2024-01-01T00:00:00Z" }
```

### Pricing
```
GET http://{node_address}:8080/api/price
Response: { "pricePerMinute": 0.001, "currency": "x402" }
```

### WireGuard Configuration
```
POST http://{node_address}:8080/api/wireguard/config
Request: {
  "sessionId": "0x...",
  "clientPublicKey": "..."
}
Response: {
  "privateKey": "...",
  "address": "10.0.0.2/32",
  "dns": ["8.8.8.8"],
  "endpoint": "node.example.com:51820",
  "publicKey": "...",
  "allowedIps": "0.0.0.0/0",
  "persistentKeepalive": 25
}
```

## Client Integration Flow

### 1. Wallet Onboarding
- User creates or imports wallet via UI
- Seed phrase encrypted with AES-256 using password
- Address displayed for funding

### 2. Balance Check
```typescript
const balance = await SessionManager.getUserBalance(walletAddress)
```

### 3. Deposit Flow
- User enters amount
- Call `x402.approve(sessionManagerAddress, amount)`
- Wait for transaction confirmation
- Call `sessionManager.deposit(amount)`
- Update UI balance

### 4. Server Selection
- Probe all available servers for latency
- Get price from each node
- Check health status
- Display sorted table

### 5. Connection Flow
- User selects server and clicks Connect
- Call `sessionManager.startSession(nodeAddress, depositAmount)`
- Poll for transaction confirmation
- Get WireGuard config from node API
- Spawn wireguard.exe with config
- Display session stats

### 6. Monitoring
- Every 5 seconds: query SessionManager for session status
- Update elapsed time and estimated spend
- Display real-time bandwidth stats (from WireGuard)

### 7. Disconnect Flow
- User clicks Disconnect
- Call `sessionManager.stopSession(sessionId)`
- Kill WireGuard process
- Save session to history
- Return remaining balance to wallet

## Error Handling

### RPC Failures
- Implement retry logic with exponential backoff
- Cache recent responses (30 seconds)
- Show user-friendly error messages
- Log all failures for debugging

### Insufficient Balance
- Check balance before allowing connection
- Show modal with balance and required amount
- Link to Deposit flow

### Node Offline
- Mark as unavailable after 3 failed health checks
- Skip in server list display
- Automatically handle if connected node goes down

### Transaction Failures
- Retry failed transactions up to 3 times
- Show specific error reasons (gas, nonce, etc.)
- Allow user to manually retry

## Testing

### Mock Data
Use these for development without actual contracts:

```typescript
// Mock balance
const mockBalance = '100.0' // 100 x402

// Mock session
const mockSession = {
  id: 'session-12345',
  nodeId: 'node-1',
  startTime: new Date(),
  isActive: true,
  elapsedTime: 300,
  estimatedSpend: 0.005,
}

// Mock server price
const mockPrice = 0.001 // per minute
```

### Base Sepolia Testnet
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Explorer: https://sepolia.basescan.org
- RPC: https://sepolia.base.org

## Security Considerations

1. **Private Keys**: Never expose private keys in logs or network requests
2. **Seed Phrases**: Encrypt with strong password using AES-256
3. **Session Tokens**: Validate signatures for all session operations
4. **HTTPS**: Use HTTPS for all node API calls in production
5. **IPC**: Use Electron context isolation for all node/wallet access

## Rate Limiting

Implement client-side rate limiting:
- Balance checks: max once per 30 seconds
- Health checks: max once per 10 seconds per node
- Session status: max once per 5 seconds during active session

## Logging

Log all API interactions for debugging:

```typescript
logger.info('Balance check', { address, balance })
logger.info('Session started', { sessionId, nodeId })
logger.error('RPC failure', { method, error })
```
