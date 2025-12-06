#!/usr/bin/env bash
# X402 protocol infrastructure bootstrap script
#
# This script provisions an Ubuntu 20.04 server with all components needed
# to run a WireGuard-enabled node agent. It installs system packages, configures
# WireGuard, deploys the node agent binary, wires up systemd + logrotate, and
# enables lightweight health checks/monitoring.

set -euo pipefail

if [[ ${DEBUG:-} == "true" ]]; then
  set -x
fi

if [[ $EUID -ne 0 ]]; then
  echo "[ERROR] Please run this script as root (sudo)." >&2
  exit 1
fi

required_vars=(
  NODE_AGENT_DOWNLOAD_URL
  NODE_AGENT_SHA256
  WG_PRIVATE_KEY
  WG_ADDRESS
  WG_PEER_PUBLIC_KEY
  WG_PEER_ENDPOINT
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "[ERROR] Missing required environment variable: ${var}" >&2
    exit 1
  fi
done

WG_LISTEN_PORT=${WG_LISTEN_PORT:-51820}
WG_ALLOWED_IPS=${WG_ALLOWED_IPS:-"10.42.0.0/24"}
WG_PRESHARED_KEY=${WG_PRESHARED_KEY:-}
WIREGUARD_INTERFACE=${WIREGUARD_INTERFACE:-wg0}
NODE_AGENT_INSTALL_DIR=${NODE_AGENT_INSTALL_DIR:-/opt/x402/node-agent}
NODE_AGENT_EXECUTABLE=${NODE_AGENT_EXECUTABLE:-node-agent}
NODE_AGENT_CONFIG_PATH=${NODE_AGENT_CONFIG_PATH:-${NODE_AGENT_INSTALL_DIR}/config.yaml}
NODE_AGENT_ENV_PATH=${NODE_AGENT_ENV_PATH:-/etc/x402/node-agent.env}
NODE_AGENT_ARCHIVE_STRIP=${NODE_AGENT_ARCHIVE_STRIP:-1}
NODE_AGENT_FLAGS=${NODE_AGENT_FLAGS:-}
NODE_AGENT_RUN_USER=${NODE_AGENT_RUN_USER:-x402}
NODE_AGENT_SERVICE_NAME=${NODE_AGENT_SERVICE_NAME:-x402-node-agent}
LOG_DIR=${LOG_DIR:-/var/log/x402}
HEALTHCHECK_BASE_UNIT=${HEALTHCHECK_BASE_UNIT:-x402-node-healthcheck}
HEALTHCHECK_INTERVAL=${HEALTHCHECK_INTERVAL:-5min}
HEALTHCHECK_HTTP_ENDPOINT=${HEALTHCHECK_HTTP_ENDPOINT:-}
PROM_NODE_EXPORTER=${PROM_NODE_EXPORTER:-true}

if [[ -f "${NODE_AGENT_CONFIG_PATH}" ]]; then
  NODE_AGENT_FLAGS="${NODE_AGENT_FLAGS} --config ${NODE_AGENT_CONFIG_PATH}"
fi

export DEBIAN_FRONTEND=noninteractive

echo "[X402] Updating apt repositories..."
apt-get update -y
apt-get upgrade -y

echo "[X402] Installing base packages..."
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  jq \
  unzip \
  ufw \
  pkg-config \
  wireguard \
  wireguard-tools \
  net-tools \
  logrotate \
  gnupg \
  lsb-release \
  bc \
  systemd-timesyncd \
  cron

if [[ "${PROM_NODE_EXPORTER}" == "true" ]]; then
  apt-get install -y prometheus-node-exporter
fi

echo "[X402] Hardening firewall rules..."
ufw allow OpenSSH >/dev/null 2>&1 || true
ufw allow ${WG_LISTEN_PORT}/udp >/dev/null 2>&1 || true
ufw --force enable >/dev/null 2>&1 || true

echo "[X402] Enabling IP forwarding..."
cat >/etc/sysctl.d/99-x402-forwarding.conf <<EOF
net.ipv4.ip_forward=1
net.ipv6.conf.all.forwarding=1
EOF
sysctl -p /etc/sysctl.d/99-x402-forwarding.conf >/dev/null

install -d -m 700 /etc/wireguard
install -d -m 750 /etc/x402
install -d -m 750 "${NODE_AGENT_INSTALL_DIR}"
install -d -m 750 "${LOG_DIR}"

if [[ "${NODE_AGENT_RUN_USER}" != "root" ]]; then
  if ! id -u "${NODE_AGENT_RUN_USER}" >/dev/null 2>&1; then
    useradd --system --home "${NODE_AGENT_INSTALL_DIR}" --shell /usr/sbin/nologin "${NODE_AGENT_RUN_USER}"
  fi
fi

cat >"/etc/wireguard/${WIREGUARD_INTERFACE}.conf" <<EOF
[Interface]
Address = ${WG_ADDRESS}
ListenPort = ${WG_LISTEN_PORT}
PrivateKey = ${WG_PRIVATE_KEY}
SaveConfig = true
PostUp = iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
PublicKey = ${WG_PEER_PUBLIC_KEY}
Endpoint = ${WG_PEER_ENDPOINT}
AllowedIPs = ${WG_ALLOWED_IPS}
PersistentKeepalive = 25
EOF

if [[ -n "${WG_PRESHARED_KEY}" ]]; then
  echo "PresharedKey = ${WG_PRESHARED_KEY}" >>"/etc/wireguard/${WIREGUARD_INTERFACE}.conf"
fi

chmod 600 "/etc/wireguard/${WIREGUARD_INTERFACE}.conf"

systemctl enable --now "wg-quick@${WIREGUARD_INTERFACE}" >/dev/null

echo "[X402] Downloading node agent from ${NODE_AGENT_DOWNLOAD_URL}..."
workdir=$(mktemp -d)
trap 'rm -rf "${workdir}"' EXIT
curl -fsSL "${NODE_AGENT_DOWNLOAD_URL}" -o "${workdir}/node-agent.archive"
echo "${NODE_AGENT_SHA256}  ${workdir}/node-agent.archive" | sha256sum -c -
find "${NODE_AGENT_INSTALL_DIR}" -mindepth 1 -maxdepth 1 -exec rm -rf {} +

if [[ "${NODE_AGENT_DOWNLOAD_URL}" =~ \\.tar\\.gz$ ]] || [[ "${NODE_AGENT_DOWNLOAD_URL}" =~ \\.tgz$ ]]; then
  tar -xzf "${workdir}/node-agent.archive" -C "${NODE_AGENT_INSTALL_DIR}" --strip-components="${NODE_AGENT_ARCHIVE_STRIP}"
elif [[ "${NODE_AGENT_DOWNLOAD_URL}" =~ \\.zip$ ]]; then
  unzip -qo "${workdir}/node-agent.archive" -d "${NODE_AGENT_INSTALL_DIR}"
else
  install -m 755 "${workdir}/node-agent.archive" "${NODE_AGENT_INSTALL_DIR}/${NODE_AGENT_EXECUTABLE}"
fi

if [[ -n "${NODE_AGENT_ENV_B64:-}" ]]; then
  echo "[X402] Writing node agent environment file from NODE_AGENT_ENV_B64"
  echo "${NODE_AGENT_ENV_B64}" | base64 -d >"${NODE_AGENT_ENV_PATH}"
elif [[ -n "${NODE_AGENT_ENV_FILE:-}" ]]; then
  echo "[X402] Copying node agent environment from ${NODE_AGENT_ENV_FILE}"
  install -m 600 "${NODE_AGENT_ENV_FILE}" "${NODE_AGENT_ENV_PATH}"
elif [[ -f "${NODE_AGENT_ENV_PATH}" ]]; then
  echo "[X402] Reusing existing node agent environment file at ${NODE_AGENT_ENV_PATH}"
else
  echo "[ERROR] Provide NODE_AGENT_ENV_B64 or NODE_AGENT_ENV_FILE so secrets can be provisioned." >&2
  exit 1
fi

chmod 600 "${NODE_AGENT_ENV_PATH}"

if [[ -n "${NODE_AGENT_CONFIG_B64:-}" ]]; then
  echo "[X402] Writing node agent config from NODE_AGENT_CONFIG_B64"
  echo "${NODE_AGENT_CONFIG_B64}" | base64 -d >"${NODE_AGENT_CONFIG_PATH}"
  chmod 640 "${NODE_AGENT_CONFIG_PATH}"
fi

if [[ -f "${NODE_AGENT_ENV_PATH}" ]]; then
  chown "${NODE_AGENT_RUN_USER}:${NODE_AGENT_RUN_USER}" "${NODE_AGENT_ENV_PATH}" || true
fi

if [[ -f "${NODE_AGENT_CONFIG_PATH}" ]]; then
  chown "${NODE_AGENT_RUN_USER}:${NODE_AGENT_RUN_USER}" "${NODE_AGENT_CONFIG_PATH}" || true
fi

chown -R "${NODE_AGENT_RUN_USER}:${NODE_AGENT_RUN_USER}" "${NODE_AGENT_INSTALL_DIR}" || true
chown -R "${NODE_AGENT_RUN_USER}:${NODE_AGENT_RUN_USER}" "${LOG_DIR}" || true

if [[ -z "${NODE_AGENT_FLAGS// }" ]] && [[ -f "${NODE_AGENT_CONFIG_PATH}" ]]; then
  NODE_AGENT_FLAGS="--config ${NODE_AGENT_CONFIG_PATH}"
fi

cat >"/etc/systemd/system/${NODE_AGENT_SERVICE_NAME}.service" <<EOF
[Unit]
Description=X402 Node Agent
After=network-online.target wg-quick@${WIREGUARD_INTERFACE}.service
Wants=network-online.target
Requires=wg-quick@${WIREGUARD_INTERFACE}.service

[Service]
User=${NODE_AGENT_RUN_USER}
Group=${NODE_AGENT_RUN_USER}
EnvironmentFile=${NODE_AGENT_ENV_PATH}
WorkingDirectory=${NODE_AGENT_INSTALL_DIR}
ExecStart=${NODE_AGENT_INSTALL_DIR}/${NODE_AGENT_EXECUTABLE} ${NODE_AGENT_FLAGS}
Restart=on-failure
RestartSec=5s
LimitNOFILE=65535
StandardOutput=append:${LOG_DIR}/node-agent.log
StandardError=append:${LOG_DIR}/node-agent.log

[Install]
WantedBy=multi-user.target
EOF

cat >/etc/logrotate.d/x402-node-agent <<EOF
${LOG_DIR}/node-agent.log {
    daily
    rotate 14
    compress
    missingok
    notifempty
    copytruncate
}
EOF

HEALTHCHECK_SCRIPT="/usr/local/bin/${NODE_AGENT_SERVICE_NAME}-healthcheck.sh"
cat >"${HEALTHCHECK_SCRIPT}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
LOG_FILE="${LOG_DIR}/healthcheck.log"
TIMESTAMP=$(date --iso-8601=seconds)
STATUS=0

if ! systemctl is-active --quiet ${NODE_AGENT_SERVICE_NAME}; then
  echo "$TIMESTAMP service ${NODE_AGENT_SERVICE_NAME} inactive, restarting" | tee -a "$LOG_FILE"
  systemctl restart ${NODE_AGENT_SERVICE_NAME}
  STATUS=1
fi

if ! wg show ${WIREGUARD_INTERFACE} >/dev/null 2>&1; then
  echo "$TIMESTAMP interface ${WIREGUARD_INTERFACE} unhealthy, restarting" | tee -a "$LOG_FILE"
  systemctl restart wg-quick@${WIREGUARD_INTERFACE}
  STATUS=1
fi

if [[ -n "${HEALTHCHECK_HTTP_ENDPOINT}" ]]; then
  curl -fsS --max-time 10 "${HEALTHCHECK_HTTP_ENDPOINT}?status=${STATUS}" >/dev/null 2>&1 || true
fi
EOF
chmod +x "${HEALTHCHECK_SCRIPT}"

cat >"/etc/systemd/system/${HEALTHCHECK_BASE_UNIT}.service" <<EOF
[Unit]
Description=X402 node health check

[Service]
Type=oneshot
ExecStart=${HEALTHCHECK_SCRIPT}
EOF

cat >"/etc/systemd/system/${HEALTHCHECK_BASE_UNIT}.timer" <<EOF
[Unit]
Description=Run X402 node health checks every ${HEALTHCHECK_INTERVAL}

[Timer]
OnBootSec=2min
OnUnitActiveSec=${HEALTHCHECK_INTERVAL}
Unit=${HEALTHCHECK_BASE_UNIT}.service
AccuracySec=1min

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "${NODE_AGENT_SERVICE_NAME}" >/dev/null
systemctl enable --now "${HEALTHCHECK_BASE_UNIT}.timer" >/dev/null

if [[ "${PROM_NODE_EXPORTER}" == "true" ]]; then
  systemctl enable --now prometheus-node-exporter >/dev/null
fi

systemctl restart logrotate.service >/dev/null 2>&1 || true

cat <<SUMMARY

[X402] Provisioning completed.
- WireGuard interface: ${WIREGUARD_INTERFACE}
- Node agent service: ${NODE_AGENT_SERVICE_NAME}
- Logs stored in: ${LOG_DIR}

Verify the node with:
  systemctl status ${NODE_AGENT_SERVICE_NAME}
  journalctl -fu ${NODE_AGENT_SERVICE_NAME}
  wg show ${WIREGUARD_INTERFACE}
SUMMARY
