# Deployments

This directory contains deployment information for each network.

## Structure

After deploying to a network, a JSON file will be created with the following structure:

```json
{
  "network": "baseSepolia",
  "chainId": 84532,
  "deployer": "0x...",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "contracts": {
    "X402Token": {
      "address": "0x...",
      "args": ["X402 Token", "X402", "1000000000000000000000000"]
    },
    "NodeRegistry": {
      "address": "0x...",
      "args": ["0x...", "10000000000000000000"]
    },
    "SessionManager": {
      "address": "0x...",
      "args": ["0x...", "0x...", "0x...", 500]
    }
  },
  "configuration": {
    "tokenName": "X402 Token",
    "tokenSymbol": "X402",
    "initialSupply": "1000000.0",
    "registrationFee": "10.0",
    "feeRecipient": "0x...",
    "protocolFeePercent": 500
  }
}
```

## Networks

### Base Sepolia (Testnet)
- Chain ID: 84532
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- File: `baseSepolia.json` (created after deployment)

### Hardhat Local
- Chain ID: 31337
- File: `hardhat.json` (created for local testing)

## Usage

To deploy to Base Sepolia:
```bash
npm run deploy:baseSepolia
```

To verify contracts:
```bash
npm run verify:baseSepolia
```
