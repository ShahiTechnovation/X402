# X402 Protocol - Quick Start Guide

## 🚀 5-Minute Setup

### 1. Install
```bash
npm install
```

### 2. Configure
```bash
cp .env.example .env
# Edit .env with your keys
```

### 3. Test
```bash
npm test
```

### 4. Deploy
```bash
# Local testing
npm run node              # Terminal 1
npm run deploy:localhost  # Terminal 2

# Base Sepolia
npm run deploy:baseSepolia
npm run verify:baseSepolia
```

## 📋 Essential Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests |
| `npm run test:coverage` | Check coverage (should be >90%) |
| `npm run deploy:baseSepolia` | Deploy to Base Sepolia |
| `npm run verify:baseSepolia` | Verify contracts |
| `npx hardhat console --network baseSepolia` | Interactive console |

## 🔑 Required Environment Variables

```env
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
PRIVATE_KEY=your_deployment_wallet_private_key
BASESCAN_API_KEY=your_basescan_api_key
FEE_RECIPIENT=your_treasury_wallet_address
```

## 📝 Common Operations

### Register a Node
```javascript
const registry = await ethers.getContractAt("NodeRegistry", REGISTRY_ADDRESS);
await token.approve(REGISTRY_ADDRESS, registrationFee);
await registry.registerNode("https://node.example.com", ratePerHour);
```

### Start a Session
```javascript
const sessionManager = await ethers.getContractAt("SessionManager", SESSION_MANAGER_ADDRESS);
await token.approve(SESSION_MANAGER_ADDRESS, depositAmount);
const tx = await sessionManager.startSession(nodeId, maxSpend, depositAmount);
```

### Settle a Session
```javascript
await sessionManager.settleSession(sessionId);
```

### Stop a Session
```javascript
await sessionManager.stopSession(sessionId);
```

### Claim Earnings
```javascript
await registry.claimEarnings(nodeId);
```

## 🆘 Troubleshooting

| Issue | Solution |
|-------|----------|
| Tests fail | Run `npm install` and ensure Node.js ≥18 |
| Deployment fails | Check `.env` configuration and wallet balance |
| "Insufficient funds" | Get testnet ETH from faucet |
| Verification fails | Wait a few minutes, then retry |

## 📚 Documentation

- **README.md**: Complete documentation
- **DEPLOYMENT_GUIDE.md**: Detailed deployment steps
- **SUMMARY.md**: Implementation overview
- **test/**: Working code examples

## 🔗 Important Links

- Base Sepolia RPC: https://sepolia.base.org
- Base Sepolia Explorer: https://sepolia.basescan.org
- Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- Bridge: https://bridge.base.org

## ✅ Pre-Deployment Checklist

- [ ] `.env` configured with valid keys
- [ ] Wallet has testnet ETH (>0.05 ETH recommended)
- [ ] All tests passing (`npm test`)
- [ ] Coverage >90% (`npm run test:coverage`)
- [ ] Treasury wallet address set in `.env`

## 📊 Test Coverage

Current coverage: **98.36% statements, 94.94% lines, 100% functions**

Run `npm run test:coverage` to verify.

## 🎯 Next Steps After Deployment

1. Run `npx hardhat run scripts/interact.ts --network baseSepolia`
2. Verify contracts on Basescan
3. Test all functionality on testnet
4. Document deployed contract addresses
5. Set up monitoring for events

## 💡 Tips

- Use hardware wallet for mainnet deployments
- Test thoroughly on testnet before mainnet
- Keep deployment JSON files safe
- Set up multisig for contract ownership
- Monitor gas prices before deploying

---

For detailed information, see **README.md** and **DEPLOYMENT_GUIDE.md**
