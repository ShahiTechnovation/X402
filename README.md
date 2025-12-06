# VPN Client - Electron + React + TypeScript

A secure desktop VPN client built with Electron, React, and TypeScript featuring WireGuard integration and blockchain-based payments.

## Features

- **Wallet Management**: Create or import wallets with seed phrase encryption using Windows Credential Locker
- **WalletConnect Integration**: Connect external wallets via web3modal/wagmi
- **Token Balance**: Display live x402 token balance from Base Sepolia
- **Deposit/Withdraw**: Guide users through approval and contract interactions
- **Server Management**: Browse and connect to hardcoded VPN servers with real-time latency and pricing
- **VPN Connection**: Connect to WireGuard servers with session statistics
- **Auto-Update**: Built-in application updates via electron-builder
- **Session Persistence**: Crash recovery with session state saved to disk
- **Error Handling**: Comprehensive error states and user notifications

## Prerequisites

- Node.js 16+ and npm
- Windows 10/11 (for full feature support)
- Base Sepolia test network access

## Development

### Setup

```bash
npm install
```

### Development Server

Start both the Vite development server and Electron:

```bash
npm run dev
```

Alternatively, run them separately:

```bash
npm run dev:vite      # Terminal 1 - React app on http://localhost:5173
npm run dev:electron  # Terminal 2 - Electron app
```

### Building

Build the application:

```bash
npm run build
```

Create distributable:

```bash
npm run build:electron
```

## Testing

### Unit Tests

```bash
npm run test
npm run test:ui  # Interactive UI
```

### E2E Tests

```bash
npm run e2e              # Run all tests
npm run e2e:smoke        # Run smoke tests only
```

## Project Structure

```
├── src/
│   ├── main.tsx                 # React entry point
│   ├── main.ts                  # Electron main process
│   ├── preload.ts              # Electron context bridge
│   ├── App.tsx                 # Root component
│   ├── components/             # React components
│   │   ├── WalletModal.tsx
│   │   ├── DashboardView.tsx
│   │   ├── dashboard/          # Dashboard components
│   │   ├── wallet/             # Wallet components
│   │   └── __tests__/          # Component tests
│   ├── store/                  # Zustand stores
│   │   ├── walletStore.ts
│   │   ├── sessionStore.ts
│   │   └── vpnStore.ts
│   ├── services/               # Business logic
│   │   ├── walletService.ts
│   │   ├── nodeService.ts
│   │   ├── storageService.ts
│   │   ├── logger.ts
│   │   └── appService.ts
│   ├── types/                  # TypeScript types
│   └── tests/                  # Test setup
├── tests/
│   └── e2e/                    # Playwright tests
├── index.html                  # HTML entry point
├── vite.config.ts             # Vite configuration
├── vitest.config.ts           # Vitest configuration
├── tsconfig.json              # TypeScript configuration
└── package.json               # Dependencies and scripts
```

## Configuration

### Wallet
- In-app wallets: Seed phrases encrypted with AES encryption
- WalletConnect: Web3Modal integration for external wallets
- Credentials stored securely using Windows Credential Manager

### Network
- Chain: Base Sepolia
- Token: x402 (ERC20)
- Node Health: Checked via `/api/health` endpoint

### Servers
Hardcoded servers with latency probing:
- India (Mumbai, Asia)
- Europe (Frankfurt, EU)

## Security

- Seed phrases encrypted with user password (AES)
- Private keys never leave the application
- All sensitive operations use context isolation in Electron
- Regular security updates via electron-builder

## Deployment

### Windows Installer

The application uses `electron-builder` to create:
- `.exe` installer (NSIS)
- Portable executable

Configure in `package.json`:
```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "password"
    }
  }
}
```

### Auto-Update

Update server configuration in electron-builder settings for automatic updates.

## Environment Variables

Create a `.env.local` file:

```
VITE_RPC_URL=https://sepolia.base.org
VITE_SESSION_MANAGER_ADDRESS=0x...
VITE_X402_TOKEN_ADDRESS=0x...
VITE_NODE_REGISTRY_ADDRESS=0x...
```

## Troubleshooting

### Port Already in Use

If port 5173 is in use:

```bash
# Windows
netstat -ano | findstr :5173
taskkill /PID <PID> /F

# Linux/Mac
lsof -i :5173
kill -9 <PID>
```

### Electron Not Starting

Check that you've built the Vite app first:
```bash
npm run build:electron
```

### WireGuard Issues

Ensure WireGuard service is installed and running on Windows:
```bash
winget install WireGuard
```

## License

MIT

## Support

For issues or questions, please create an issue on GitHub.
