# X402 Protocol - Hardhat Project

A decentralized protocol for managing compute sessions with node operators. The protocol includes three main contracts:

- **X402Token**: ERC-20 token for protocol payments
- **NodeRegistry**: Registration and management of compute nodes
- **SessionManager**: Session lifecycle management with automatic settlement

## Features

- 🔐 Secure session management with deposit/refund mechanisms
- 💰 Automatic settlement with protocol fee distribution
- 🎯 Node operator earnings tracking and claiming
- ⏱️ Time-based pricing with hourly rates
- 🛡️ Reentrancy protection and pausable contracts
- 📊 Comprehensive test coverage (>90%)

## Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- Git

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd X402

# Install dependencies
npm install
```

## Configuration

### 1. Environment Setup

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# RPC Configuration
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# Deployment Account - Use a dedicated wallet for deployment
PRIVATE_KEY=your_private_key_here

# Block Explorer API Key - Get from https://basescan.org/myapikey
BASESCAN_API_KEY=your_basescan_api_key_here

# Treasury Configuration
FEE_RECIPIENT=your_treasury_wallet_address_here

# Protocol Configuration
PROTOCOL_FEE_PERCENT=500  # 5% fee
REGISTRATION_FEE=10       # 10 tokens to register a node
```

### 2. RPC Configuration

**Base Sepolia (Testnet)**
- RPC URL: `https://sepolia.base.org`
- Chain ID: 84532
- Explorer: https://sepolia.basescan.org

**Getting Testnet ETH:**
1. Get Sepolia ETH from https://sepoliafaucet.com
2. Bridge to Base Sepolia using https://bridge.base.org

### 3. Treasury Wallet

The `FEE_RECIPIENT` address receives protocol fees. Configure this to your treasury/multisig wallet address.

### 4. Protocol Fee

The `PROTOCOL_FEE_PERCENT` is in basis points (100 = 1%, 500 = 5%, 1000 = 10%). Maximum allowed is 10000 (100%).

## Testing

### Run All Tests

```bash
npx hardhat test
```

### Run Specific Test File

```bash
npx hardhat test test/X402Token.test.ts
npx hardhat test test/NodeRegistry.test.ts
npx hardhat test test/SessionManager.test.ts
```

### Run with Gas Reporter

```bash
REPORT_GAS=true npx hardhat test
```

### Generate Coverage Report

```bash
npx hardhat coverage
```

The coverage report will be generated in the `coverage/` directory. Open `coverage/index.html` in your browser to view detailed coverage metrics.

## Compilation

```bash
npx hardhat compile
```

This generates:
- Contract artifacts in `artifacts/`
- TypeScript types in `typechain-types/`

## Deployment

### Deploy to Hardhat Local Network

```bash
# Terminal 1 - Start local node
npx hardhat node

# Terminal 2 - Deploy
npx hardhat run scripts/deploy.ts --network localhost
```

### Deploy to Base Sepolia

```bash
npx hardhat run scripts/deploy.ts --network baseSepolia
```

The deployment will:
1. Deploy X402Token with configured initial supply
2. Deploy NodeRegistry with registration fee
3. Deploy SessionManager with protocol fee configuration
4. Save deployment details to `deployments/baseSepolia.json`

### Deployment Output

After successful deployment, you'll find contract addresses and configuration in:

```
deployments/
  └── baseSepolia.json
```

Example output:
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

## Contract Verification

After deployment, verify contracts on Block Explorer:

```bash
npx hardhat run scripts/verify.ts --network baseSepolia
```

This script:
1. Reads deployment data from `deployments/baseSepolia.json`
2. Verifies each contract on Basescan
3. Makes source code publicly viewable

Manual verification:

```bash
npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS> <CONSTRUCTOR_ARGS>
```

## Contract Interactions

### Using Hardhat Console

```bash
npx hardhat console --network baseSepolia
```

```javascript
// Get contract instances
const X402Token = await ethers.getContractFactory("X402Token");
const token = await X402Token.attach("TOKEN_ADDRESS");

// Check balance
const balance = await token.balanceOf("ADDRESS");
console.log(ethers.formatEther(balance));
```

### Common Operations

**Register a Node:**
```javascript
// Approve registration fee
await token.approve(registryAddress, registrationFee);

// Register node
await registry.registerNode("https://node.example.com", hourlyRate);
```

**Start a Session:**
```javascript
// Approve deposit
await token.approve(sessionManagerAddress, depositAmount);

// Start session
const tx = await sessionManager.startSession(nodeId, maxSpend, depositAmount);
const receipt = await tx.wait();
```

**Settle a Session:**
```javascript
await sessionManager.settleSession(sessionId);
```

**Stop a Session:**
```javascript
await sessionManager.stopSession(sessionId);
```

**Claim Node Earnings:**
```javascript
await registry.claimEarnings(nodeId);
```

## Architecture

### X402Token
- Standard ERC-20 token with burn capability
- Owner can mint new tokens
- Used for all protocol payments

### NodeRegistry
- Operators register nodes with endpoint and hourly rate
- Registration requires fee payment
- Nodes can be activated/deactivated
- Earnings tracked per node
- Pausable for emergency stops

### SessionManager
- Users deposit tokens to start sessions
- Automatic settlement based on elapsed time
- Protocol fees deducted from payments
- MaxSpend enforcement prevents overspending
- Refunds remaining balance on stop
- Reentrancy protected

### Fee Structure

**Protocol Fee Flow:**
1. User pays for session usage
2. Protocol fee (e.g., 5%) goes to fee recipient
3. Remaining amount goes to node operator
4. Node operator claims earnings from NodeRegistry

**Example:**
- User pays 100 tokens for 1 hour
- Protocol fee (5%): 5 tokens → treasury
- Node earning (95%): 95 tokens → operator

## Security Features

- ✅ ReentrancyGuard on financial operations
- ✅ Pausable contracts for emergency stops
- ✅ Ownable access control
- ✅ Input validation on all functions
- ✅ Safe math operations (Solidity 0.8+)
- ✅ Comprehensive test coverage

## Gas Optimization

- Efficient storage layout
- Batch operations where possible
- Optimized loops
- Events for off-chain indexing

## Troubleshooting

### "Insufficient funds" Error
- Ensure your deployment wallet has enough ETH for gas
- Check token balances for operations

### "Already Verified" on Verification
- Contract is already verified, no action needed

### Tests Failing
- Ensure you're using Node.js >= 18
- Run `npm install` to ensure dependencies are up to date
- Check Hardhat network is properly configured

### Deployment Fails
- Verify `.env` configuration
- Check RPC URL is accessible
- Ensure private key has sufficient ETH for gas

## Project Structure

```
.
├── contracts/              # Solidity contracts
│   ├── X402Token.sol
│   ├── NodeRegistry.sol
│   └── SessionManager.sol
├── test/                   # Test files
│   ├── X402Token.test.ts
│   ├── NodeRegistry.test.ts
│   └── SessionManager.test.ts
├── scripts/                # Deployment scripts
│   ├── deploy.ts
│   └── verify.ts
├── deployments/            # Deployment outputs
├── hardhat.config.ts       # Hardhat configuration
├── tsconfig.json          # TypeScript configuration
├── .env.example           # Example environment file
└── README.md              # This file
```

## Development Workflow

1. **Write/Modify Contracts** in `contracts/`
2. **Write Tests** in `test/`
3. **Run Tests** with `npx hardhat test`
4. **Check Coverage** with `npx hardhat coverage`
5. **Deploy Locally** with `npx hardhat node` and `npx hardhat run scripts/deploy.ts`
6. **Deploy to Testnet** with `npx hardhat run scripts/deploy.ts --network baseSepolia`
7. **Verify Contracts** with `npx hardhat run scripts/verify.ts --network baseSepolia`

## CI/CD

The project includes a GitHub Actions workflow that:
- Runs on push and pull requests
- Installs dependencies
- Compiles contracts
- Runs full test suite
- Generates coverage report

See `.github/workflows/test.yml` for details.

## License

MIT

## Support

For issues and questions:
- Open an issue on GitHub
- Check existing documentation
- Review test files for usage examples

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new features
4. Ensure all tests pass
5. Submit a pull request

## Changelog

### v1.0.0
- Initial release
- X402Token, NodeRegistry, SessionManager contracts
- Comprehensive test suite
- Deployment and verification scripts
- Documentation
