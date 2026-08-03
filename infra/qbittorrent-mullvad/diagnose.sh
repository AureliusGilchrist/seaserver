#!/usr/bin/env bash
# Run from the compose directory:  sudo ./diagnose.sh
# Collects everything needed to tell WHY the Mullvad tunnel passes no traffic.

echo "=== 1. WireGuard peer state (the decisive one) ==="
# gluetun restarts the VPN every ~6s, so poll until we catch a live interface.
for i in $(seq 1 40); do
  out=$(docker compose exec -T gluetun wg show 2>/dev/null)
  if [ -n "$out" ]; then echo "$out"; break; fi
  sleep 0.5
done
[ -z "$out" ] && echo "!! could not read wg state — is the gluetun container up?"

echo
echo "=== 2. Tunnel interface + routes ==="
docker compose exec -T gluetun sh -c 'ip -4 addr show tun0; ip -4 route' 2>/dev/null

echo
echo "=== 3. Can the HOST reach a Mullvad endpoint on UDP/51820 at all? ==="
# If the ISP or a firewall blocks this, nothing inside Docker can work.
timeout 5 nc -zvu 185.65.134.76 51820 2>&1 || echo "(nc inconclusive — UDP has no handshake)"
ss -u -a state unconnected 2>/dev/null | head -5

echo
echo "=== 4. Host firewall ==="
systemctl is-active firewalld 2>/dev/null
firewall-cmd --state 2>/dev/null
firewall-cmd --list-all 2>/dev/null | head -20

echo
echo "=== 5. Does WireGuard work on the HOST, outside Docker? ==="
echo "This isolates Docker from Mullvad/ISP. Fill in your key, then:"
cat <<'EOF'

  sudo dnf install -y wireguard-tools
  sudo tee /etc/wireguard/mullvad-test.conf >/dev/null <<'CONF'
[Interface]
PrivateKey = <YOUR NEW KEY>
Address = <ADDRESS FROM THE SAME DOWNLOADED CONFIG>
DNS = 10.64.0.1

[Peer]
PublicKey = /iBl4QBrGVQ+wIeQML5MHZTLnZ2vUL5NKfPtgIRJPGE=
AllowedIPs = 0.0.0.0/0
Endpoint = 185.65.134.76:51820
CONF
  sudo wg-quick up mullvad-test
  sudo wg show                       # handshake?
  curl -s https://am.i.mullvad.net/connected
  sudo wg-quick down mullvad-test

EOF
echo "If this ALSO fails, the problem is Mullvad-side or your ISP — not this compose file."
