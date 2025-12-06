# X402 Protocol Deployment Guide

This guide provides step-by-step instructions for deploying the X402 Protocol contracts to Base Sepolia testnet.

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- MetaMask or similar wallet
- Base Sepolia testnet ETH
- Basescan API key (for contract verification)

## Step 1: Environment Setup

### 1.1 Clone and Install

```bash
git clone <repository-url>
cd X402
npm install
```

### 1.2 Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure the following:

```env
# RPC Configuration
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Your deployment wallet private key (NEVER commit this!)
PRIVATE_KEY=your_private_key_here

# Basescan API key for contract verification
BASESCAN_API_KEY=your_basescan_api_key_here

# Treasury wallet to receive protocol fees
FEE_RECIPIENT=your_treasury_wallet_address

# Protocol configuration
PROTOCOL_FEE_PERCENT=500  # 5% in basis points
REGISTRATION_FEE=10       # 10 tokens to register a node
INITIAL_SUPPLY=1000000    # Initial token supply
```

### 1.3 Get Testnet ETH

1. Get Sepolia ETH from: https://sepoliafaucet.com
2. Bridge to Base Sepolia: https://bridge.base.org
3. Ensure you have at least 0.1 ETH for gas

## Step 2: Pre-Deployment Testing

### 2.1 Compile Contracts

```bash
npm run compile
```

Expected output: "Compiled X Solidity files successfully"

### 2.2 Run Tests

```bash
npm test
```

All tests should pass. Expected: 78 passing tests

### 2.3 Check Coverage

```bash
npm run test:coverage
```

Coverage should be >90% for all contracts.

## Step 3: Deploy to Base Sepolia

### 3.1 Test on Local Network (Optional)

```bash
# Terminal 1: Start local node
npm run node

# Terminal 2: Deploy locally
npm run deploy:localhost
```

### 3.2 Deploy to Base Sepolia

```bash
npm run deploy:baseSepolia
```

**Expected Output:**
```
=== Deployment Parameters ===
Token Name: X402 Token
Token Symbol: X402
Initial Supply: 1000000.0
Registration Fee: 10.0
Fee Recipient: 0x...
Protocol Fee Percent: 500 ( 5 %)

=== Deploying X402Token ===
X402Token deployed to: 0x...

=== Deploying NodeRegistry ===
NodeRegistry deployed to: 0x...

=== Deploying SessionManager ===
SessionManager deployed to: 0x...

=== Deployment Summary ===
X402Token: 0x...
NodeRegistry: 0x...
SessionManager: 0x...

Deployment completed successfully!
```

### 3.3 Save Deployment Information

The deployment details are automatically saved to `deployments/baseSepolia.json`. **Keep this file safe** - it contains all contract addresses and constructor arguments.

Example:
```json
{
  "network": "baseSepolia",
  "chainId": 84532,
  "deployer": "0x...",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "contracts": {
    "X402Token": {
      "address": "0x...",
      "args": [...]
    },
    "NodeRegistry": {
      "address": "0x...",
      "args": [...]
    },
    "SessionManager": {
      "address": "0x...",
      "args": [...]
    }
  }
}
```

## Step 4: Verify Contracts

Verify all contracts on Basescan:

```bash
npm run verify:baseSepolia
```

**Expected Output:**
```
=== Verifying Contracts on baseSepolia ===

Verifying X402Token...
✓ X402Token verified

Verifying NodeRegistry...
✓ NodeRegistry verified

Verifying SessionManager...
✓ SessionManager verified

=== Verification Complete ===
```

Visit Basescan to view verified contracts:
- https://sepolia.basescan.org/address/<CONTRACT_ADDRESS>

## Step 5: Post-Deployment Configuration

### 5.1 Configure Protocol Parameters

If you need to adjust parameters after deployment:

```bash
npx hardhat console --network baseSepolia
```

```javascript
// Get contract instances
const sessionManager = await ethers.getContractAt("SessionManager", "SESSION_MANAGER_ADDRESS");

// Update protocol fee (500 = 5%)
await sessionManager.setProtocolFeePercent(500);

// Update fee recipient
await sessionManager.setFeeRecipient("NEW_TREASURY_ADDRESS");
```

### 5.2 Transfer Token Ownership (Optional)

If using a multisig or DAO:

```javascript
const token = await ethers.getContractAt("X402Token", "TOKEN_ADDRESS");
await token.transferOwnership("MULTISIG_ADDRESS");
```

## Step 6: Initial Distribution

### 6.1 Distribute Tokens

Transfer tokens to initial stakeholders:

```javascript
const token = await ethers.getContractAt("X402Token", "TOKEN_ADDRESS");

// Distribute to node operators
await token.transfer("OPERATOR_ADDRESS", ethers.parseEther("10000"));

// Distribute to users
await token.transfer("USER_ADDRESS", ethers.parseEther("5000"));
```

### 6.2 Approve SessionManager

Users and operators need to approve the contracts to spend tokens:

```javascript
const token = await ethers.getContractAt("X402Token", "TOKEN_ADDRESS");

// Users approve SessionManager for deposits
await token.approve("SESSION_MANAGER_ADDRESS", ethers.parseEther("10000"));

// Operators approve NodeRegistry for registration fee
await token.approve("NODE_REGISTRY_ADDRESS", ethers.parseEther("100"));
```

## Step 7: Test Deployment

### 7.1 Register a Test Node

```javascript
const registry = await ethers.getContractAt("NodeRegistry", "REGISTRY_ADDRESS");

await registry.registerNode(
  "https://test-node.example.com",
  ethers.parseEther("10") // 10 tokens per hour
);
```

### 7.2 Start a Test Session

```javascript
const sessionManager = await ethers.getContractAt("SessionManager", "SESSION_MANAGER_ADDRESS");

const tx = await sessionManager.startSession(
  0, // nodeId
  ethers.parseEther("100"), // maxSpend
  ethers.parseEther("50")   // deposit
);

console.log("Session started:", tx.hash);
```

### 7.3 Check Deployment Status

Use the interaction script:

```bash
npx hardhat run scripts/interact.ts --network baseSepolia
```

This will show:
- Contract addresses
- Token information
- Registered nodes
- Active sessions
- Protocol fees

## Troubleshooting

### Issue: "Insufficient funds for gas"

**Solution:** Ensure your wallet has enough Base Sepolia ETH. Get more from faucets or bridge.

### Issue: "Nonce too high"

**Solution:** Reset your MetaMask account or adjust nonce manually.

### Issue: "Already Verified" on verification

**Solution:** This is normal if contracts are already verified. No action needed.

### Issue: "INVALID_CONSTRUCTOR_ARGUMENTS"

**Solution:** Check that constructor arguments in `deployments/baseSepolia.json` match the deployed contract.

### Issue: "Transaction underpriced"

**Solution:** Increase gas price in `hardhat.config.ts` or wait for network congestion to clear.

## Mainnet Deployment Checklist

Before deploying to mainnet:

- [ ] All tests passing
- [ ] Coverage >90%
- [ ] Contracts audited by professional auditors
- [ ] Multi-signature wallet configured for ownership
- [ ] Time-lock configured for critical functions
- [ ] Emergency pause mechanism tested
- [ ] Documentation complete
- [ ] Front-end integration tested on testnet
- [ ] Gas costs optimized
- [ ] Protocol parameters finalized
- [ ] Legal compliance reviewed
- [ ] Community notified

## Security Recommendations

1. **Use Hardware Wallet**: Deploy from a hardware wallet, not a hot wallet
2. **Multi-Signature**: Transfer ownership to a multisig after deployment
3. **Time-Lock**: Add time-lock for critical parameter changes
4. **Monitoring**: Set up monitoring for contract events
5. **Incident Response**: Have an incident response plan ready
6. **Bug Bounty**: Consider a bug bounty program
7. **Regular Audits**: Schedule regular security audits

## Support

For issues or questions:
- GitHub Issues: <repository-url>/issues
- Documentation: README.md
- Test Examples: test/ directory

## Next Steps

After successful deployment:

1. Update front-end with contract addresses
2. Set up event monitoring and indexing
3. Create user documentation
4. Announce to community
5. Monitor initial usage closely
6. Be ready to pause if issues arise

## Resources

- Base Sepolia Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Base Bridge: https://bridge.base.org
- Basescan: https://sepolia.basescan.org
- Hardhat Docs: https://hardhat.org/docs
- OpenZeppelin: https://docs.openzeppelin.com
