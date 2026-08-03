#!/usr/bin/env bash
#
# zfs-raidz3-setup.sh — Fedora / OpenZFS, native encryption only.
#
#   raidz3 pool, aes-256-gcm, passphrase, PBKDF2 calibrated to ~15 min unlock.
#   Datasets: <pool>/torrents  <pool>/Soul  <pool>/Bone  <pool>/Flesh
#
#   NOTE: OpenZFS derives the wrapping key with PBKDF2-HMAC-SHA1 in libzfs.
#   It is serial and single-threaded. There is no tunable to parallelize it.
#   The 15 minutes will occupy exactly one core.
#
# EVERYTHING ON THE LISTED DISKS IS DESTROYED.
#
set -Eeuo pipefail

##############################################################################
# CONFIG
##############################################################################

POOL="tank"
MOUNTBASE="/${POOL}"

# USE /dev/disk/by-id PATHS.   ls -l /dev/disk/by-id/ | grep -v part
DISKS=(
  /dev/disk/by-id/ata-REPLACE_ME_0
  /dev/disk/by-id/ata-REPLACE_ME_1
  /dev/disk/by-id/ata-REPLACE_ME_2
  /dev/disk/by-id/ata-REPLACE_ME_3
  /dev/disk/by-id/ata-REPLACE_ME_4
)

TARGET_UNLOCK_SECONDS=900       # 15 minutes
ASHIFT=12                       # 12 = 4K sectors. Immutable after creation.
NEST_UNDER_TORRENTS=false       # true = Soul/Bone/Flesh live under torrents
VERIFY_UNLOCK_TIME=true         # final export/timed-import check (~15 min)
RECOVERY_DIR="/root/${POOL}-recovery"

##############################################################################

log()  { printf '\n\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

##############################################################################
# 1. Preflight
##############################################################################

[[ $EUID -eq 0 ]] || die "Run as root."

if ! command -v zpool >/dev/null 2>&1; then
  cat >&2 <<'EOF'
[x] ZFS is not installed. On Fedora:

    sudo dnf install -y https://zfsonlinux.org/fedora/zfs-release-2-8$(rpm --eval "%{dist}").noarch.rpm
    sudo dnf install -y kernel-devel zfs
    sudo modprobe zfs
    echo zfs | sudo tee /etc/modules-load.d/zfs.conf

  Check https://openzfs.github.io/openzfs-docs/Getting%20Started/Fedora/ for the
  current zfs-release version and confirm your kernel is supported — Fedora
  ships kernels faster than the ZFS module supports them.
EOF
  exit 1
fi

modprobe zfs 2>/dev/null || true
lsmod | grep -q '^zfs' || die "zfs kernel module not loaded. Check 'dmesg | grep -i zfs'."

for b in wipefs sgdisk python3 zdb; do
  command -v "$b" >/dev/null 2>&1 \
    || die "Missing '$b'. Install: dnf install -y gdisk util-linux python3 zfs"
done

zpool list -H -o name 2>/dev/null | grep -qx "$POOL" && die "Pool '$POOL' already exists."
(( ${#DISKS[@]} >= 4 )) || die "raidz3 requires at least 4 devices; you listed ${#DISKS[@]}."
NDISKS=${#DISKS[@]}

log "Checking disks"
for d in "${DISKS[@]}"; do
  [[ -b "$d" ]] || die "Not a block device: $d"
  case "$d" in
    /dev/disk/by-id/*) ;;
    *) warn "$d is not a /dev/disk/by-id path — kernel names move between boots." ;;
  esac
  printf '    %-70s %s\n' "$d" "$(lsblk -dno SIZE "$(readlink -f "$d")" 2>/dev/null || echo '?')"
done

log "Layout: raidz3, ${NDISKS} disks, $((NDISKS - 3)) disks' usable capacity, survives any 3 failures."

cat <<EOF

  ############################################################
  #  ALL DATA ON THE ${NDISKS} DISKS ABOVE WILL BE DESTROYED.
  ############################################################

EOF
read -r -p "Type DESTROY to continue: " confirm
[[ "$confirm" == "DESTROY" ]] || die "Aborted."

##############################################################################
# 2. Passphrase
##############################################################################

log "Passphrase"
cat <<'EOF'
    The only thing protecting the data. No recovery. Use 6+ diceware words.
    PBKDF2 is not memory-hard, so an attacker with GPUs gets far more benefit
    from parallelism than you get from 15 minutes on one core. Passphrase
    length is doing most of the actual work here — one extra random word is
    worth more than the entire iteration count increase.
EOF

while :; do
  read -r -s -p "  Passphrase (min 12 chars): " PASSPHRASE; echo
  read -r -s -p "  Confirm: " PASSPHRASE2; echo
  [[ "$PASSPHRASE" == "$PASSPHRASE2" ]] || { warn "Mismatch."; continue; }
  (( ${#PASSPHRASE} >= 12 )) || { warn "Use at least 12 characters."; continue; }
  break
done
unset PASSPHRASE2

##############################################################################
# 3. Calibrate pbkdf2iters
##############################################################################

log "Calibrating PBKDF2 for ~${TARGET_UNLOCK_SECONDS}s unlock (~15s)"

PBKDF2_ITERS=$(python3 - "$TARGET_UNLOCK_SECONDS" <<'PY'
import hashlib, sys, time
target = float(sys.argv[1])
probe  = 2_000_000
pw, salt = b"benchmark-passphrase", b"0123456789abcdef"
hashlib.pbkdf2_hmac("sha1", pw, salt, 200_000)          # warm up
best = None
for _ in range(3):
    t0 = time.perf_counter()
    hashlib.pbkdf2_hmac("sha1", pw, salt, probe)
    dt = time.perf_counter() - t0
    best = dt if best is None else min(best, dt)
ips = probe / best
print(max(int(target * ips), 1000))
print(f"    {ips/1e6:.2f}M PBKDF2-SHA1 iterations/sec (single core)", file=sys.stderr)
PY
)

log "pbkdf2iters = ${PBKDF2_ITERS}"
warn "Paid on EVERY key load: every boot, every import, every crash recovery."
warn "Single-threaded, ~$((TARGET_UNLOCK_SECONDS/60)) minutes, cannot be changed after creation."
read -r -p "  Continue? [y/N] " ok
[[ "${ok,,}" == "y" ]] || die "Aborted."

##############################################################################
# 4. Wipe
##############################################################################

log "Wiping signatures and partition tables"
for d in "${DISKS[@]}"; do
  echo "    $d"
  wipefs -aq "$d"       || true
  sgdisk --zap-all "$d" >/dev/null 2>&1 || true
done
udevadm settle
sleep 2

##############################################################################
# 5. Create the pool
##############################################################################
#   encryption=aes-256-gcm   AEAD — authenticates data, not just hides it
#   checksum=sha512          doubles as the MAC on encrypted datasets
#   redundant_metadata=all   full ditto-block redundancy for metadata
#   normalization/utf8only   CREATE-TIME ONLY
#   failmode=wait            block on fatal I/O rather than return garbage
#   cachefile=none           no auto-import at boot (a 15-min unlock in the
#                            boot path lands you in an emergency shell)

log "Creating raidz3 pool '$POOL'"

printf '%s\n%s\n' "$PASSPHRASE" "$PASSPHRASE" | zpool create -f \
  -o ashift="$ASHIFT" \
  -o autotrim=on \
  -o autoexpand=on \
  -o autoreplace=on \
  -o failmode=wait \
  -o cachefile=none \
  -O encryption=aes-256-gcm \
  -O keyformat=passphrase \
  -O keylocation=prompt \
  -O pbkdf2iters="$PBKDF2_ITERS" \
  -O checksum=sha512 \
  -O redundant_metadata=all \
  -O compression=zstd \
  -O atime=off \
  -O relatime=on \
  -O xattr=sa \
  -O acltype=posixacl \
  -O dnodesize=auto \
  -O normalization=formD \
  -O utf8only=on \
  -O overlay=off \
  -O canmount=off \
  -O mountpoint="$MOUNTBASE" \
  "$POOL" raidz3 "${DISKS[@]}"

log "Pool created."

##############################################################################
# 6. Datasets
##############################################################################

log "Creating datasets"

zfs create "$POOL/torrents"
zfs set recordsize=1M      "$POOL/torrents"
zfs set logbias=throughput "$POOL/torrents"

if [[ "$NEST_UNDER_TORRENTS" == "true" ]]; then PARENT="$POOL/torrents"; else PARENT="$POOL"; fi

for name in Soul Bone Flesh; do
  zfs create "$PARENT/$name"
  zfs set recordsize=1M "$PARENT/$name"
done

# Recovery bundle dataset: 3 independent copies of every block on top of
# raidz3 parity. Costs 3x space on a few MiB.
zfs create -o copies=3 -o recordsize=128K -o compression=zstd-9 "$POOL/.recovery"

zfs list -o name,used,avail,mountpoint,encryption,keystatus -r "$POOL"

##############################################################################
# 7. Metadata resilience
##############################################################################
# Covered here:
#   1. On-disk ZFS metadata — raidz3 parity + redundant_metadata=all + ditto
#      blocks + sha512. Scrubs verify it; ZED reports it.
#   2. Vdev labels — four per disk, but all four die with the disk. Dumped to
#      the recovery bundle so a pool can be reconstructed/diagnosed by hand.
#   3. The knowledge needed to reassemble this at 3am in two years, including
#      pbkdf2iters, which is NOT recoverable from anywhere if you forget it
#      matters (an unlock that "hangs" is really just PBKDF2 running).

log "Building recovery bundle"

mkdir -p "$RECOVERY_DIR"; chmod 700 "$RECOVERY_DIR"

for i in "${!DISKS[@]}"; do
  serial=$(basename "${DISKS[$i]}")
  zdb -l "${DISKS[$i]}" > "$RECOVERY_DIR/vdev-label-${i}-${serial}.txt" 2>&1 || \
    warn "zdb -l failed on ${DISKS[$i]}"
done

{
  echo "# ${POOL} recovery notes — generated $(date -Is) on $(hostname)"
  echo
  echo "## Layout"
  echo "Single raidz3 vdev, ${NDISKS} whole disks, ZFS native encryption."
  echo "Tolerates 3 simultaneous disk failures. No LUKS layer."
  echo
  echo "## Unlock cost"
  echo "pbkdf2iters=${PBKDF2_ITERS}  (~$((TARGET_UNLOCK_SECONDS/60)) minutes, SINGLE CORE, PBKDF2-HMAC-SHA1)"
  echo "An unlock that appears hung is normal. Do not interrupt it."
  echo "This value is fixed at creation and cannot be changed in place."
  echo
  echo "## Members"
  for i in "${!DISKS[@]}"; do
    real=$(readlink -f "${DISKS[$i]}")
    echo "[$i] ${DISKS[$i]}"
    echo "     kernel-at-setup: $real"
    echo "     size:  $(lsblk -dno SIZE "$real" 2>/dev/null)"
    echo "     model: $(lsblk -dno MODEL,SERIAL "$real" 2>/dev/null)"
  done
  echo
  echo "## Import"
  echo "zpool import -l -d /dev/disk/by-id ${POOL}"
  echo "zfs mount -a"
  echo
  echo "## Replace a failed disk"
  echo "zpool replace ${POOL} <old-by-id> <new-by-id>"
  echo "raidz3 survives 3 losses at once. Do not let them accumulate."
  echo
  echo "## Pool properties at creation"
  zpool get all "$POOL"
  echo
  echo "## Dataset properties at creation"
  zfs get -r all "$POOL"
  echo
  echo "## zpool status"
  zpool status -v "$POOL"
  echo
  echo "## zdb -C"
  zdb -C "$POOL" 2>/dev/null || true
} > "$RECOVERY_DIR/RECOVERY.md"
chmod 600 "$RECOVERY_DIR/RECOVERY.md"

( cd "$RECOVERY_DIR" && sha256sum ./* > SHA256SUMS 2>/dev/null ) || true
cp -a "$RECOVERY_DIR"/. "$MOUNTBASE/.recovery/" 2>/dev/null \
  || warn "Could not copy recovery bundle into $MOUNTBASE/.recovery"

##############################################################################
# 8. Monitoring, scrubs, snapshots
##############################################################################

log "Enabling ZED fault notifications"
if [[ -f /etc/zfs/zed.d/zed.rc ]]; then
  sed -i 's|^#\?ZED_EMAIL_ADDR=.*|ZED_EMAIL_ADDR="root"|'            /etc/zfs/zed.d/zed.rc
  sed -i 's|^#\?ZED_NOTIFY_VERBOSE=.*|ZED_NOTIFY_VERBOSE=1|'         /etc/zfs/zed.d/zed.rc
  sed -i 's|^#\?ZED_USE_ENCLOSURE_LEDS=.*|ZED_USE_ENCLOSURE_LEDS=1|' /etc/zfs/zed.d/zed.rc
  systemctl enable --now zfs-zed.service 2>/dev/null || warn "Could not enable zfs-zed."
else
  warn "/etc/zfs/zed.d/zed.rc not found — configure fault notifications manually."
fi

log "Enabling monthly scrub"
systemctl enable --now zfs.target 2>/dev/null || true
systemctl enable --now "zfs-scrub-monthly@${POOL}.timer" 2>/dev/null \
  || warn "Could not enable scrub timer; schedule 'zpool scrub $POOL' via cron."

# Refresh the recovery bundle weekly so it never drifts from reality, and
# re-dump vdev labels so silent label damage shows up before it matters.
log "Installing weekly recovery-bundle refresh"
cat > /usr/local/sbin/"${POOL}"-refresh-recovery <<REFRESH
#!/usr/bin/env bash
set -euo pipefail
POOL="$POOL"; RD="$RECOVERY_DIR"; MB="$MOUNTBASE"
DISKS=($(printf '"%s" ' "${DISKS[@]}"))
zpool list -H -o name | grep -qx "\$POOL" || { echo "\$POOL not imported; skipping."; exit 0; }
mkdir -p "\$RD"; chmod 700 "\$RD"
for i in "\${!DISKS[@]}"; do
  [[ -b "\${DISKS[\$i]}" ]] || { echo "MISSING DISK: \${DISKS[\$i]}" >&2; continue; }
  zdb -l "\${DISKS[\$i]}" > "\$RD/vdev-label-\$i-\$(basename "\${DISKS[\$i]}").txt" 2>&1 || \
    echo "zdb -l failed: \${DISKS[\$i]}" >&2
done
{ echo "# \$POOL recovery refresh — \$(date -Is)"
  echo "pbkdf2iters=$PBKDF2_ITERS (~$((TARGET_UNLOCK_SECONDS/60)) min, single core)"
  echo; zpool status -v "\$POOL"; echo; zpool get all "\$POOL"
  echo; zfs get -r all "\$POOL"; echo; zdb -C "\$POOL" 2>/dev/null || true
} > "\$RD/RECOVERY.md"
chmod 600 "\$RD/RECOVERY.md"
( cd "\$RD" && sha256sum ./* > SHA256SUMS 2>/dev/null ) || true
[[ -d "\$MB/.recovery" ]] && cp -a "\$RD"/. "\$MB/.recovery/" || true
REFRESH
chmod 700 /usr/local/sbin/"${POOL}"-refresh-recovery

cat > /etc/systemd/system/"${POOL}"-refresh-recovery.service <<EOF
[Unit]
Description=Refresh ${POOL} recovery bundle and vdev label dumps
[Service]
Type=oneshot
ExecStart=/usr/local/sbin/${POOL}-refresh-recovery
EOF
cat > /etc/systemd/system/"${POOL}"-refresh-recovery.timer <<EOF
[Unit]
Description=Weekly ${POOL} recovery bundle refresh
[Timer]
OnCalendar=weekly
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now "${POOL}-refresh-recovery.timer" 2>/dev/null \
  || warn "Could not enable recovery refresh timer."

# systemd's default 90s start timeout will kill a 15-minute key load if this
# pool is ever wired into automatic unlocking.
mkdir -p /etc/systemd/system/zfs-load-key@.service.d
cat > /etc/systemd/system/zfs-load-key@.service.d/10-long-pbkdf2.conf <<'EOF'
# Key derivation here is deliberately expensive (~15 min, single core).
# Without this, systemd kills the unlock at 90 seconds.
[Service]
TimeoutStartSec=infinity
EOF
systemctl daemon-reload

##############################################################################
# 9. Unlock / lock helpers
##############################################################################

cat > /usr/local/sbin/"${POOL}"-unlock <<UNLOCK
#!/usr/bin/env bash
# Import and unlock $POOL. Takes ~$((TARGET_UNLOCK_SECONDS/60)) minutes on one core. Do not interrupt.
set -euo pipefail
[[ \$EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
start=\$(date +%s)
echo "Deriving key (\$(date +%H:%M:%S)) — ~$((TARGET_UNLOCK_SECONDS/60)) min, single core, no progress output."
zpool import -l -d /dev/disk/by-id "$POOL"
zfs mount -a
zpool status "$POOL"
echo "Unlocked in \$(( \$(date +%s) - start ))s."
UNLOCK
chmod 700 /usr/local/sbin/"${POOL}"-unlock

cat > /usr/local/sbin/"${POOL}"-lock <<LOCK
#!/usr/bin/env bash
set -euo pipefail
[[ \$EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
zpool export "$POOL" || { echo "Export failed — something is using the pool." >&2; exit 1; }
echo "Locked."
LOCK
chmod 700 /usr/local/sbin/"${POOL}"-lock

##############################################################################
# 10. Verify real unlock time
##############################################################################

if [[ "$VERIFY_UNLOCK_TIME" == "true" ]]; then
  log "Verifying real unlock time (export + timed import, ~$((TARGET_UNLOCK_SECONDS/60)) min)"
  zpool export "$POOL"
  start=$(date +%s)
  printf '%s\n' "$PASSPHRASE" | zpool import -l -d /dev/disk/by-id "$POOL"
  zfs mount -a
  elapsed=$(( $(date +%s) - start ))
  log "Measured unlock: ${elapsed}s (target ${TARGET_UNLOCK_SECONDS}s)"
  if (( elapsed < TARGET_UNLOCK_SECONDS * 8 / 10 || elapsed > TARGET_UNLOCK_SECONDS * 12 / 10 )); then
    warn "More than 20% off target. pbkdf2iters is fixed at creation — correcting"
    warn "it means destroying and rebuilding the pool. Scale ${PBKDF2_ITERS} by"
    warn "${TARGET_UNLOCK_SECONDS}/${elapsed} and re-run if you care enough."
  fi
else
  warn "Skipped unlock-time verification."
fi

unset PASSPHRASE

##############################################################################

cat <<EOF

$(printf '\033[1;32m==> Done.\033[0m')

  Pool       $POOL — raidz3, ${NDISKS} disks, tolerates 3 simultaneous failures
  Crypto     ZFS native aes-256-gcm (authenticated), sha512, pbkdf2iters=$PBKDF2_ITERS
  Datasets   $POOL/torrents
             $PARENT/Soul
             $PARENT/Bone
             $PARENT/Flesh

  Unlock     sudo ${POOL}-unlock          (~$((TARGET_UNLOCK_SECONDS/60)) min, ONE core, no progress bar)
  Lock       sudo ${POOL}-lock
  Health     zpool status -v $POOL ; zpool scrub $POOL

  Metadata resilience
    redundant_metadata=all + raidz3 parity + ditto blocks + sha512
    ZED fault notifications to root; monthly scrub timer
    Recovery bundle: $RECOVERY_DIR  (refreshed weekly)
      copy inside the pool at $MOUNTBASE/.recovery with copies=3
      >>> COPY $RECOVERY_DIR TO OFFLINE MEDIA NOW <<<
      A recovery bundle that only lives on the pool it recovers is decoration.

  Fixed forever (rebuild required to change): pbkdf2iters, ashift, normalization
  Back up the passphrase physically. raidz3 is redundancy, not backup.

EOF
