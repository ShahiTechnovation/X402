# X402 Deployment & Operations Guide

This document stitches together the on-chain, node, and client pieces required to
run the X402 MVP end‑to‑end. Follow it sequentially to deploy the smart contracts
on Base Sepolia, provision WireGuard-backed node agents, build the Windows client,
and operate the system safely.

- **Audience**: DevOps engineers, protocol operators, and release engineers.
- **Goal**: A reproducible deployment that new contributors can follow without
  prior context.

---

## 1. Prerequisites

| Component | Requirements |
| --- | --- |
| Tooling | Node.js ≥ 18, npm ≥ 9, Git, Hardhat, Bash, OpenSSL, Azure/AWS CLI (for secrets). |
| Blockchain | Funded Base Sepolia wallet with ≥ 0.05 ETH for gas per deployment. |
| Infrastructure | 1–2 Ubuntu 20.04 VPS instances with static public IPv4, UDP 51820 open. |
| Windows Build Host | Windows 11 workstation with Visual Studio Build Tools, WiX Toolset, and `signtool.exe`. |
| Credentials | BaseScan API key, deployment wallet private key, WireGuard keypairs, code-signing certificate (PFX + password). |

> **Never** commit `.env` files or private keys. Use a password manager or cloud
> secrets manager (AWS Secrets Manager, HashiCorp Vault, Azure Key Vault) to store
> the sensitive values referenced below.

---

## 2. Environment & Secrets Layout

1. **Hardhat / Contracts** (`.env` at repo root). Copy `.env.example` and fill:
   ```bash
   BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
   PRIVATE_KEY=0xabc123...
   BASESCAN_API_KEY=your_basescan_api_key
   TOKEN_NAME=X402 Token
   TOKEN_SYMBOL=X402
   INITIAL_SUPPLY=1000000
   REGISTRATION_FEE=10
   FEE_RECIPIENT=0xYourTreasury
   PROTOCOL_FEE_PERCENT=500
   ```
2. **Node agent** (`infra/node-agent.env.example`). Store the populated version
   in your secrets manager. The bootstrapper consumes it via `NODE_AGENT_ENV_B64`
   or `NODE_AGENT_ENV_FILE` and installs it at `/etc/x402/node-agent.env`.
3. **Windows client** (per-user PowerShell profile or `.env.local`). Set variables
   such as `REACT_APP_SESSION_MANAGER_ADDRESS`, `REACT_APP_NODE_REGISTRY_ADDRESS`,
   and `REACT_APP_BASE_RPC_URL`. Use Windows Credential Manager or the Secrets
   Manager extension in VS Code to inject anything sensitive.

Use `direnv`, `dotenvx`, or GitHub Actions secrets so that no credential ever
lives in plain text on disk. For multi-operator teams, prefer `sops` + KMS.

---

## 3. Deploying Contracts to Base Sepolia

1. Install dependencies and compile:
   ```bash
   npm install
   npx hardhat compile
   ```
2. Confirm your deployer has Base Sepolia ETH:
   ```bash
   npx hardhat balance --network baseSepolia --account ${DEPLOYER_ADDRESS}
   ```
3. Deploy all contracts:
   ```bash
   npx hardhat run scripts/deploy.ts --network baseSepolia
   ```
   The script prints addresses for `X402Token`, `NodeRegistry`, and
   `SessionManager`, and stores them in `deployments/baseSepolia.json`.
4. Verify on Basescan:
   ```bash
   npx hardhat run scripts/verify.ts --network baseSepolia
   ```
5. Record the output addresses in your shared ops notebook—they are needed for
   the node agent and Windows client config. Example entry:
   ```text
   X402Token          0x1234...abcd
   NodeRegistry       0xabcd...1234
   SessionManager     0xfeed...cafe
   Fee Recipient      0xTreasury...
   Protocol Fee (bps) 500  # 5%
   Registration Fee   10 X402
   ```

> **Tip**: When deploying from CI, feed the same `.env` values through the CI
> secret store and archive the resulting `deployments/baseSepolia.json` artifact
> for traceability.

---

## 4. Provisioning Node Agents

1. **Reserve static networking** per node:
   - Allocate a static public IPv4 address.
   - Create `vpn-node-X.example.com` DNS `A` records pointing to each IP.
   - Plan the WireGuard overlay (`10.42.0.0/24` works for two nodes).
2. **Generate WireGuard keys**:
   ```bash
   umask 077
   wg genkey | tee node1.key | wg pubkey > node1.pub
   ```
3. **Prepare the node agent environment file** using
   `infra/node-agent.env.example` as a template. Include:
   - Contract addresses from Section 3.
   - Node metadata (`NODE_ENDPOINT`, `NODE_RATE_PER_HOUR`, `NODE_ID`).
   - Signing wallet private key (store encrypted / provide via secrets manager).
4. **Run the bootstrapper** described in `infra/README.md`:
   ```bash
   scp infra/bootstrap-node.sh ubuntu@vpn-node-1:/tmp/
   scp node-agent.env ubuntu@vpn-node-1:/tmp/
   ssh ubuntu@vpn-node-1 'sudo \
     NODE_AGENT_DOWNLOAD_URL="https://github.com/x402/node-agent/releases/download/v0.2.0/node-agent-linux-amd64.tar.gz" \
     NODE_AGENT_SHA256="<sha256>" \
     NODE_AGENT_ENV_FILE="/tmp/node-agent.env" \
     WG_PRIVATE_KEY="$(cat node1.key)" \
     WG_ADDRESS="10.42.0.2/32" \
     WG_PEER_PUBLIC_KEY="$(cat controller.pub)" \
     WG_PEER_ENDPOINT="controller.example.com:51820" \
     bash /tmp/bootstrap-node.sh'
   ```
5. **Validate**:
   - `sudo wg show wg0` → latest handshake + transfer stats.
   - `sudo systemctl status x402-node-agent` → `active (running)`.
   - `curl -sf localhost:9100/metrics` if Prometheus node exporter enabled.
6. Repeat for a second VPS using a different `WG_ADDRESS`, `NODE_ID`, and DNS
   name so the network can fail over between nodes.

---

## 5. Building & Signing the Windows Client

1. Clone the Windows client repository (same organization, `windows-client` or
   `vpn-client` project) onto a Windows 11 workstation with Admin rights.
2. Install prerequisites:
   ```powershell
   choco install nodejs-lts git visualstudio2022buildtools wixtoolset nsis -y
   npm install --global electron-builder@latest
   ```
3. Inject environment variables (PowerShell):
   ```powershell
   $env:REACT_APP_SESSION_MANAGER_ADDRESS = "0xfeed...cafe"
   $env:REACT_APP_NODE_REGISTRY_ADDRESS  = "0xabcd...1234"
   $env:REACT_APP_BASE_RPC_URL           = "https://sepolia.base.org"
   $env:REACT_APP_NODE_DISCOVERY_URL     = "https://api.example.com/nodes"
   ```
   Use the Windows Credential Manager or `dotnet user-secrets` to supply secrets
   like WalletConnect keys—never inline them in source.
4. Build the client binaries:
   ```powershell
   npm install
   npm run build
   npm run dist  # produces signed installer + portable zip
   ```
5. Sign the artifacts with your EV certificate:
   ```powershell
   signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 \
     /f C:\Secrets\x402-code-signing.pfx /p $env:CODESIGN_PFX_PASSWORD \
     dist\X402ClientSetup.exe
   ```
6. Verify:
   ```powershell
   signtool verify /pa /all dist\X402ClientSetup.exe
   ```
7. Distribute the installer via Intune, JAMF, or your preferred distribution
   channel. Provide the `.env`/registry values separately so operators can rotate
   endpoints without redeploying binaries.

---

## 6. Protocol Operations & Monitoring

### Telemetry Expectations

| Signal | Source | Threshold | Action |
| --- | --- | --- | --- |
| Node agent heartbeat | `systemd` health timer / `HEALTHCHECK_HTTP_ENDPOINT` | >10 min gap | Investigate the node, restart service, verify WireGuard. |
| Session settlement lag | Hardhat script / alert from backend | >15 min without `SessionSettled` events | Trigger manual `settleSession` via script; inspect RPC health. |
| Protocol fee backlog | `SessionManager.totalProtocolFees()` | > 1000 X402 | Run `withdrawProtocolFees` to sweep into treasury wallet. |
| Token supply drift | `X402Token.totalSupply()` | Unexpected mint/burn | Audit owner wallet + mint events. |
| Disk usage | `prometheus-node-exporter` | >80% | Increase volume or rotate logs faster. |

### Failure Handling Runbooks

1. **WireGuard tunnel down**
   1. `ssh` into node, run `sudo wg show wg0`.
   2. If `latest handshake` is empty, restart: `sudo systemctl restart wg-quick@wg0`.
   3. If still failing, rotate keys on both ends, update `/etc/wireguard/wg0.conf`,
      and reload the systemd unit.
2. **Node agent cannot settle sessions**
   1. Check logs: `journalctl -u x402-node-agent -n 200 -f`.
   2. Validate RPC endpoint with `curl -X POST ${X402_RPC_URL}` sample payload.
   3. Update `X402_RPC_URL` in `/etc/x402/node-agent.env`, restart the service.
3. **Protocol fee withdrawal stuck**
   1. Call `totalProtocolFees()` in a console (`npx hardhat console --network baseSepolia`).
   2. If >0, execute `await sessionManager.withdrawProtocolFees()` using the owner wallet.
   3. Confirm treasury wallet received the transfer and record the tx hash.
4. **Windows client misconfigured**
   1. Ask user to open `%AppData%/X402/settings.json` (or `.env.local`) and
      confirm contract addresses.
   2. Ensure there are no literal private keys inside the binary—rotate and
      redeploy if necessary.

Document any incident in your runbook backlog (PagerDuty, Opsgenie) so handoffs
capture context.

### Security Checklist

- Hot wallet used for node operations holds minimal funds; replenish from a cold
  wallet when required.
- Rotate protocol-level owners using a multisig (even on Base Sepolia testnet) so
  a single credential leak cannot mint arbitrary tokens.
- Store code-signing certificates inside an HSM or Azure Key Vault; export only
  during build time.
- Regularly run `npm audit` and `npx hardhat test` after dependency updates.
- Enforce TLS 1.2+ on any API consumed by the Windows client to avoid MITM.

---

## 7. Next Steps & References

- Infrastructure automation: [`infra/README.md`](../infra/README.md)
- End-to-end validation: [`docs/e2e.md`](./e2e.md)
- Quick context on contracts: [`SUMMARY.md`](../SUMMARY.md)

Following this guide endows a new engineer with everything needed to deploy the
contracts, stand up secure node agents, and ship a signed Windows client without
placing secrets in source control.
