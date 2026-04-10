#!/bin/bash
set -euo pipefail

# ZeroClawed Security Stack Installer
# Deploys: adversary-detector + security-gateway + clashd
# Reads agents.json to auto-configure credentials and proxy settings

INSTALL_DIR="/opt/zeroclawed"
CONFIG_DIR="/etc/zeroclawed"
GATEWAY_PORT="8080"
DETECTOR_PORT="9800"
CLASHD_PORT="9001"

echo "=== ZeroClawed Security Stack Installer ==="

# Parse args
ACTION="${1:-install}"
TARGET_HOST="${2:-127.0.0.1}"
SSH_KEY="${3:-~/.ssh/id_ed25519}"

SSH_CMD="ssh -i $SSH_KEY -o StrictHostKeyChecking=no root@$TARGET_HOST"

build() {
    echo "Building release binaries..."
    cd /root/projects/zeroclawed
    cargo build --release -p adversary-detector -p security-gateway -p clashd 2>&1 | tail -3
    echo "Build complete."
}

deploy_binaries() {
    echo "Deploying to $TARGET_HOST..."
    $SSH_CMD "mkdir -p $INSTALL_DIR/bin $CONFIG_DIR" 2>&1

    for bin in adversary-detector security-gateway clashd; do
        scp -i $SSH_KEY -o StrictHostKeyChecking=no \
            /root/projects/zeroclawed/target/release/$bin \
            root@$TARGET_HOST:$INSTALL_DIR/bin/$bin 2>&1
        $SSH_CMD "chmod +x $INSTALL_DIR/bin/$bin"
    done
    echo "Binaries deployed."
}

deploy_config() {
    echo "Deploying config to $TARGET_HOST..."
    scp -i $SSH_KEY -o StrictHostKeyChecking=no \
        /root/projects/zeroclawed/crates/clashd/config/agents.json \
        root@$TARGET_HOST:$CONFIG_DIR/agents.json 2>&1
    scp -i $SSH_KEY -o StrictHostKeyChecking=no \
        /root/projects/zeroclawed/crates/clashd/config/default-policy.star \
        root@$TARGET_HOST:$CONFIG_DIR/default-policy.star 2>&1
    echo "Config deployed."
}

install_services() {
    echo "Installing systemd services..."
    $SSH_CMD "cat > /etc/systemd/system/adversary-detector.service << 'EOF'
[Unit]
Description=ZeroClawed Adversary Detector
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/bin/adversary-detector
Environment=ADVERSARY_DETECTOR_PORT=$DETECTOR_PORT
Environment=RUST_LOG=adversary_detector=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/security-gateway.service << 'EOF'
[Unit]
Description=ZeroClawed Security Gateway
After=network.target adversary-detector.service

[Service]
Type=simple
ExecStart=$INSTALL_DIR/bin/security-gateway
Environment=AGENT_CONFIG=$CONFIG_DIR/agents.json
Environment=ADVERSARY_DETECTOR_PORT=$DETECTOR_PORT
Environment=RUST_LOG=security_gateway=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/clashd.service << 'EOF'
[Unit]
Description=ZeroClawed Clashd Policy Engine
After=network.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/bin/clashd
Environment=CLASHD_CONFIG=$CONFIG_DIR/agents.json
Environment=RUST_LOG=clashd=info
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable adversary-detector security-gateway clashd
systemctl restart adversary-detector security-gateway clashd
sleep 2
systemctl status adversary-detector --no-pager | head -5
systemctl status security-gateway --no-pager | head -5
systemctl status clashd --no-pager | head -5" 2>&1
}

setup_proxy_env() {
    echo "Setting up proxy environment for agents..."
    $SSH_CMD "cat > /etc/profile.d/zeroclawed-proxy.sh << 'EOF'
# ZeroClawed Security Gateway — Tier 1 Enforcement
# All HTTP/HTTPS traffic is routed through the security gateway
export HTTP_PROXY=http://127.0.0.1:$GATEWAY_PORT
export HTTPS_PROXY=http://127.0.0.1:$GATEWAY_PORT
export NO_PROXY=localhost,127.0.0.1,192.168.1.*,10.*.*.*

# Agent credentials (loaded by gateway from agents.json providers list)
# Set these in /etc/zeroclawed/agents.json or here:
# export OPENAI_API_KEY=sk-...
# export ANTHROPIC_API_KEY=sk-ant-...
EOF
chmod +x /etc/profile.d/zeroclawed-proxy.sh
echo 'Proxy env vars installed at /etc/profile.d/zeroclawed-proxy.sh'" 2>&1
}

verify() {
    echo "=== Verification ==="
    echo "Adversary Detector:"
    $SSH_CMD "curl -s http://127.0.0.1:$DETECTOR_PORT/health" 2>&1
    echo ""
    echo "Security Gateway:"
    $SSH_CMD "curl -s http://127.0.0.1:$GATEWAY_PORT/health" 2>&1
    echo ""
    echo "Clashd:"
    $SSH_CMD "curl -s http://127.0.0.1:$CLASHD_PORT/health" 2>&1
    echo ""
    echo "=== All services verified ==="
}

case "$ACTION" in
    install)
        build
        deploy_binaries
        deploy_config
        install_services
        setup_proxy_env
        verify
        echo ""
        echo "=== Installation Complete ==="
        echo "Services:"
        echo "  adversary-detector → $DETECTOR_PORT (content scanning)"
        echo "  security-gateway   → $GATEWAY_PORT (mandatory proxy)"
        echo "  clashd             → $CLASHD_PORT (policy engine)"
        echo ""
        echo "To set API credentials, add to agents.json providers or set env vars:"
        echo "  export OPENAI_API_KEY=sk-..."
        echo "  export ANTHROPIC_API_KEY=sk-ant-..."
        ;;
    build)
        build
        ;;
    deploy)
        deploy_binaries
        deploy_config
        install_services
        verify
        ;;
    verify)
        verify
        ;;
    *)
        echo "Usage: $0 {install|build|deploy|verify} [target_host] [ssh_key]"
        ;;
esac
