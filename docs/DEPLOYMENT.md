# Deployment Guide

## Prerequisites

- Windows 10/11 or Windows Server 2016+
- Node.js 18+ installed
- Code signing certificate (for production releases)
- Base Sepolia testnet account with x402 tokens

## Development Build

### Setup

```bash
# Install dependencies
npm install

# Create .env.local with configuration
cat > .env.local << EOF
VITE_RPC_URL=https://sepolia.base.org
VITE_SESSION_MANAGER_ADDRESS=0x...
VITE_X402_TOKEN_ADDRESS=0x...
EOF

# Start development servers
npm run dev
```

The app will:
- Open on http://localhost:5173 (Vite dev server)
- Launch Electron window automatically
- Hot reload on code changes

## Production Build

### Build Steps

```bash
# Install dependencies
npm install

# Build Vite React app and Electron main
npm run build

# Build distributable Windows installer
npm run dist
```

### Output

- `dist/VPN Client-1.0.0.exe` - NSIS installer
- `dist/VPN Client 1.0.0.exe` - Portable executable
- `dist/latest.yml` - Update manifest

### Code Signing

Configure certificate in `package.json`:

```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.pfx",
      "certificatePassword": "password",
      "signingHashAlgorithms": ["sha256"]
    }
  }
}
```

Or use environment variables:

```bash
export WIN_CSC_LINK=path/to/certificate.pfx
export WIN_CSC_KEY_PASSWORD=password
npm run dist
```

## Testing

### Unit Tests

```bash
npm run test                # Run all tests
npm run test:ui             # Interactive UI
npm run test -- --coverage  # With coverage report
```

### E2E Tests

```bash
npm run e2e              # Run all E2E tests
npm run e2e:smoke        # Run smoke tests only

# Or run with specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
```

### Manual Testing Checklist

- [ ] Wallet creation with password
- [ ] Wallet import from seed phrase
- [ ] Balance display updates
- [ ] Deposit flow completes
- [ ] Withdraw flow completes
- [ ] Server list loads and sorts
- [ ] Connect to server works
- [ ] Session stats display
- [ ] Disconnect works
- [ ] Crash recovery restores session
- [ ] Error states show properly

## Auto-Update Setup

### Update Server

Configure electron-builder to use your update server:

```json
{
  "publish": {
    "provider": "github",
    "owner": "your-org",
    "repo": "vpn-client"
  }
}
```

Or use S3:

```json
{
  "publish": {
    "provider": "s3",
    "bucket": "your-bucket",
    "path": "releases"
  }
}
```

### Release Process

1. Build new version
2. Create GitHub release with .exe and .yml
3. Users get notified and can update automatically

## Installation

### End User Installation

1. Download `VPN Client-1.0.0.exe` from releases
2. Run installer
3. Follow installation wizard
4. App launches automatically
5. Create or import wallet
6. Fund wallet with x402 tokens

### Uninstall

1. Open Windows Settings → Apps
2. Find "VPN Client"
3. Click "Uninstall"
4. Follow uninstall wizard

### Portable Version

Run `VPN Client 1.0.0.exe` directly without installation.

## WireGuard Setup

### Windows 10/11 Installation

```bash
# Using winget
winget install WireGuard

# Or download from
# https://www.wireguard.com/install/#windows
```

### Driver Installation

The app requires WireGuard kernel mode driver:

```bash
# Install WinTun driver (included with WireGuard)
# Or manually via Device Manager
```

## Environment Configuration

### Production Environment

Create `.env` file in app data directory:

```
Windows: %APPDATA%/VPN Client/.env
Linux: ~/.config/vpn-client/.env
macOS: ~/Library/Application Support/VPN Client/.env
```

### Example Production Config

```env
VITE_RPC_URL=https://mainnet.base.org
VITE_SESSION_MANAGER_ADDRESS=0x...production...
VITE_X402_TOKEN_ADDRESS=0x...production...
VITE_ENABLE_DEVTOOLS=false
VITE_APP_VERSION=1.0.0
```

## Troubleshooting

### App won't start
- Check Windows Event Viewer for errors
- Verify Node.js version: `node --version`
- Try running as Administrator
- Check Task Manager for hung processes

### WireGuard connection fails
- Verify WireGuard is installed: `wg /c show`
- Check Windows Firewall settings
- Try disabling antivirus temporarily
- Check system logs: `wg /c show interfaces`

### Balance not updating
- Check RPC URL in .env
- Verify wallet address is correct
- Check Base Sepolia block explorer
- Restart app to force refresh

### Installer issues
- Download latest from releases
- Disable antivirus for installation
- Try portable version instead
- Check disk space (>500MB recommended)

## Performance Tuning

### Application Performance

```json
{
  "build": {
    "minify": "terser",
    "sourcemap": false,
    "rollupOptions": {
      "output": {
        "manualChunks": {
          "vendor": ["react", "react-dom"],
          "web3": ["ethers", "web3modal"]
        }
      }
    }
  }
}
```

### Memory Usage

- Limit log retention: 1000 entries
- Clear session cache on disconnect
- Lazy load components
- Limit API call frequency

## Monitoring

### Log Collection

Logs stored in:
```
Windows: %APPDATA%/VPN Client/logs/
Linux: ~/.config/vpn-client/logs/
```

Export logs via menu → Help → Export Logs

### Crash Reporting

Automated crash reports sent to:
```
POST https://sentry.example.com/...
```

## Rollback Plan

If issues detected in production release:

1. Stop distributing new version
2. Keep previous version available
3. Document issues in release notes
4. Build and test patch release
5. Publish hotfix

## Security Checklist

- [ ] Code signed with trusted certificate
- [ ] No hardcoded secrets in code
- [ ] Dependencies up to date
- [ ] Electron updated to latest patch
- [ ] CSP headers configured
- [ ] IPC security validated
- [ ] Private keys never logged
- [ ] HTTPS used for all APIs

## Versioning

Use semantic versioning:
- MAJOR: Breaking changes
- MINOR: New features
- PATCH: Bug fixes

Example: `1.2.3` → Major 1, Minor 2, Patch 3

## Support

For deployment issues:
1. Check logs in %APPDATA%/VPN Client/logs/
2. Review troubleshooting section
3. Create issue with logs attached
