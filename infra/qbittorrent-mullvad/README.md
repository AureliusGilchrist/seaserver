# qBittorrent + Mullvad (WireGuard) via gluetun

## Setup

```bash
cp .env.example .env && chmod 600 .env
$EDITOR .env                    # key, address, LAN subnet, PUID/PGID
docker compose up -d
docker compose logs -f gluetun  # wait for the tunnel
```

Verify you are actually behind Mullvad — do this before adding any torrent:

```bash
docker compose exec gluetun wget -qO- https://am.i.mullvad.net/connected
```

Must say `You are connected to Mullvad`. If it doesn't, stop and fix it.

WebUI: `http://<host>:8080`. The linuxserver image generates a temporary admin
password on first start:

```bash
docker compose logs qbittorrent | grep -i password
```

Change it immediately under Tools → Options → Web UI.

## Port forwarding

**Mullvad removed port forwarding in 2023.** No incoming connections, ever. You
will connect out to peers fine, but you are a non-connectable ("yellow") peer:
slower swarm joins and worse ratios on private trackers. Nothing in this compose
file can fix that — it's a Mullvad policy.

The `6881` publishes are there so the port is consistent, and so this file works
unchanged if you move to a provider that does forward ports (AirVPN, ProtonVPN,
PIA — all supported by gluetun, and gluetun can auto-configure qBittorrent's
listen port via `VPN_PORT_FORWARDING=on`).

If you switch providers, add to gluetun's environment:

```yaml
      VPN_PORT_FORWARDING: "on"
      VPN_PORT_FORWARDING_UP_COMMAND: '/bin/sh -c "wget -O- --retry-connrefused --post-data=\"json={\\\"listen_port\\\":{{PORTS}}}\" http://127.0.0.1:8080/api/v2/app/setPreferences 2>&1"'
```

## qBittorrent settings that matter here

Tools → Options:

- **Connection → Peer connection protocol:** TCP and μTP
- **BitTorrent → Encryption mode:** Require encryption
- **BitTorrent:** disable DHT, PeX and Local Peer Discovery if you use private
  trackers; leave on for public ones
- **Advanced → Network interface:** leave as *Any interface*. Inside gluetun's
  namespace `tun0` is the only route out; binding explicitly just breaks on
  reconnect when the interface index changes
- **Downloads:** keep incomplete and complete paths on the same dataset
  (`/downloads/incomplete`, `/downloads/complete`) so completion is a rename,
  not a full copy

## Notes

- `network_mode: "service:gluetun"` is what makes this leakproof. qBittorrent
  has no network stack of its own, so there is no path out if the tunnel dies.
  The tradeoff: qBittorrent's ports must be published on **gluetun**, and if
  gluetun restarts, qBittorrent loses networking until it comes back —
  `depends_on: condition: service_healthy` handles the ordering.
- Adding more containers to the tunnel (Prowlarr, Sonarr, etc.): give each
  `network_mode: "service:gluetun"` and publish its port on gluetun. Port
  numbers must not collide.
- Pin `qmcgaw/gluetun:v3` rather than `:latest` — gluetun has broken provider
  configs on major bumps before.
- On the ZFS setup: `/tank/torrents` has `recordsize=1M` and
  `logbias=throughput`, which is right for this workload. If the pool is locked,
  the bind mount resolves to an empty directory and qBittorrent will happily
  "download" into it — unlock the pool before starting the stack, or the
  torrents re-download on the next unlock.
