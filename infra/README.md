# X402 Infrastructure Layer

This directory contains the operational glue for bringing up one or more X402 node
agents on Ubuntu 20.04 VPS instances. The bootstrap script provisions WireGuard,
locks down the OS, deploys the node agent binary, configures systemd/logrotate,
and wires basic health checks so that new operators can reproduce the MVP in a
cloud environment quickly.

## 1. Topology & Static Networking

1. **Reserve static public IPs** for every node (e.g., Elastic IP in AWS, Floating
   IP in DigitalOcean). Associate each address with an Ubuntu 20.04 VM sized with
   at least 2 vCPUs, 2 GB RAM, and 40 GB SSD.
2. **Attach DNS names** to the static IPs so that clients can reference human-
   readable endpoints (`vpn-node-1.example.com`). Create `A` records for each
   node plus (optionally) an `anycast`-style `vpn.example.com` that rotates
   between them.
3. Document each node's `public_ip`, `wg_internal_ip` (e.g., `10.42.0.2/32`), and
   physical region. You will feed these values into the bootstrap script.

> _Tip_: keep a `nodes.yaml` inventory that lists `wireguard_private_key`,
> `wireguard_public_key`, `static_ip`, and `dns_name` for each host. Store it in
> a secret manager so you can rotate keys without touching Git.

## 2. Required Inputs

The bootstrapper reads configuration from the environment so that no values are
hard-coded:

| Variable | Description |
| --- | --- |
| `NODE_AGENT_DOWNLOAD_URL` | HTTPS URL pointing to the Linux AMD64 node agent release artifact. |
| `NODE_AGENT_SHA256` | SHA-256 checksum of the artifact for tamper detection. |
| `WG_PRIVATE_KEY` | WireGuard private key for the node (keep in a secret manager). |
| `WG_ADDRESS` | Interface address (e.g., `10.42.0.2/32`). |
| `WG_PEER_PUBLIC_KEY` | Control-plane peer that this node dials. |
| `WG_PEER_ENDPOINT` | `host:port` (e.g., `controller.example.com:51820`). |
| `WG_ALLOWED_IPS` | CIDRs routed through the tunnel (default `10.42.0.0/24`). |
| `NODE_AGENT_ENV_B64` or `NODE_AGENT_ENV_FILE` | Secrets + config consumed by the node agent (see `node-agent.env.example`). |
| `NODE_AGENT_CONFIG_B64` | Optional application config (YAML/JSON) encoded as base64. |
| `HEALTHCHECK_HTTP_ENDPOINT` | Optional heartbeat URL (Healthchecks.io, PagerDuty). |

Additional knobs such as `NODE_AGENT_RUN_USER`, `NODE_AGENT_SERVICE_NAME`, and
`NODE_AGENT_FLAGS` have safe defaults but can be overridden when needed.

## 3. Preparing the Target Host

1. Provision a clean Ubuntu 20.04 image and add your SSH key.
2. Upload the filled-out environment file:
   ```bash
   scp infra/node-agent.env.example ubuntu@${NODE_IP}:/tmp/node-agent.env
   # Edit on the host or replace values locally before copying.
   ```
3. Export the sensitive inputs in your shell so the script can read them:
   ```bash
   export NODE_AGENT_DOWNLOAD_URL="https://github.com/x402/node-agent/releases/download/v0.2.0/node-agent-linux-amd64.tar.gz"
   export NODE_AGENT_SHA256="<sha256-from-release>"
   export NODE_AGENT_ENV_FILE=/tmp/node-agent.env
   export WG_PRIVATE_KEY="$(pass show infra/node-1/wg-private)"
   export WG_ADDRESS="10.42.0.2/32"
   export WG_PEER_PUBLIC_KEY="<controller-key>"
   export WG_PEER_ENDPOINT="controller.example.com:51820"
   ```

## 4. Running the Bootstrap Script

From your workstation:
```bash
ssh ubuntu@${NODE_IP} 'bash -s' <<'EOF'
set -euo pipefail
$(cat infra/bootstrap-node.sh)
EOF
```
Or execute it interactively after copying the file onto the host:
```bash
scp infra/bootstrap-node.sh ubuntu@${NODE_IP}:/tmp
ssh ubuntu@${NODE_IP} 'sudo env \
  NODE_AGENT_DOWNLOAD_URL="$NODE_AGENT_DOWNLOAD_URL" \
  NODE_AGENT_SHA256="$NODE_AGENT_SHA256" \
  NODE_AGENT_ENV_FILE="/tmp/node-agent.env" \
  WG_PRIVATE_KEY="$WG_PRIVATE_KEY" \
  WG_ADDRESS="$WG_ADDRESS" \
  WG_PEER_PUBLIC_KEY="$WG_PEER_PUBLIC_KEY" \
  WG_PEER_ENDPOINT="$WG_PEER_ENDPOINT" \
  bash /tmp/bootstrap-node.sh'
```

To provision two nodes at once, loop through their IPs:
```bash
for HOST in node-a.example.com node-b.example.com; do
  echo "Provisioning $HOST"
  ssh ubuntu@$HOST "sudo -E /tmp/bootstrap-node.sh" &
done
wait
```

## 5. Post-Provision Checklist

1. **WireGuard tunnel**: `sudo wg show wg0` should list the peer with a recent
   handshake.
2. **Systemd unit**: `sudo systemctl status x402-node-agent` must report
   `active (running)`.
3. **Health timer**: `systemctl list-timers '*node-healthcheck*'` confirms the
   watchdog is scheduled every 5 minutes.
4. **Firewall**: `sudo ufw status numbered` shows UDP 51820 is open.
5. **Monitoring**: If `PROM_NODE_EXPORTER=true`, scrape the node via Prometheus
   (`:9100`).

## 6. Log Rotation & Monitoring

- Application logs stream to `/var/log/x402/node-agent.log` with daily rotation
  (14 copies retained) configured in `/etc/logrotate.d/x402-node-agent`.
- Health checks append to `/var/log/x402/healthcheck.log` and can fan out to
  third-party services via `HEALTHCHECK_HTTP_ENDPOINT`.
- The script installs `prometheus-node-exporter` (optional) so platform teams can
  alert on CPU, RAM, disk, etc.

## 7. Failure Handling

| Failure | Detection | Immediate Action |
| --- | --- | --- |
| WireGuard handshake stale | `wg show` / telemetry alert | Run `systemctl restart wg-quick@wg0` (already automated by the health check). |
| Node agent crash / exit loop | `systemctl status x402-node-agent` | Review `journalctl -u x402-node-agent` to inspect stack traces, redeploy binary if needed. |
| Disk filling with logs | Check `/var/log/x402` usage | Confirm logrotate is running (`logrotate -d /etc/logrotate.conf`), prune archives, increase volume. |
| RPC failures to Base Sepolia | Health check sets non-zero status | Rotate `X402_RPC_URL` to a fallback endpoint (Infura/Alchemy) and restart the service. |

Document remediation steps in your team runbook (e.g., Confluence, OpsLevel) so
on-call engineers have one place to look.

## 8. Security Considerations

- **Secrets**: inject `NODE_AGENT_ENV_B64` via a secrets manager (HashiCorp
  Vault, AWS Secrets Manager). Avoid storing unencrypted `.env` files on disk.
- **Key rotation**: generate distinct WireGuard keys per node; rotate hot wallet
  keys monthly and revoke them in the protocol when compromised.
- **Least privilege**: the service runs under the `x402` system user with no
  login shell. Use `sudo systemctl` for maintenance rather than running commands
  as root.
- **Auditability**: forward `/var/log/x402/*.log` to a SIEM (e.g., Loki) and set
  retention policies that align with your compliance program.

By following the above steps alongside `docs/deployment.md`, a fresh engineer can
provision one or two production-ready node agents that interoperate with the
smart contracts deployed on Base Sepolia.
