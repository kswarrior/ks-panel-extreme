package drivers

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// runInsideExec runs a single shell command inside the named instance via the
// driver's own Exec (non-TTY pipe mode) and returns its combined stdout. This
// is the universal path for drivers that can shell into the workload (docker,
// lxd, multipass expose a shell). KVM uses the serial console which can't
// cheaply return a captured string, so the kvm driver shells out to virsh
// instead — see kvm.go.
func runInsideExec(ctx context.Context, name string, drv Driver, command []string, timeout time.Duration) (string, error) {
	cctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	sess, err := drv.Exec(cctx, name, false, 0, 0, command)
	if err != nil {
		return "", err
	}
	defer sess.Close()

	// Drain stdout and stderr CONCURRENTLY. Reading them sequentially is
	// the textbook pipe-deadlock the install package hit in production: the
	// child fills its 64KB stderr pipe buffer, blocks writing more, and
	// never writes the rest of stdout — meanwhile io.ReadAll(stdout) is
	// parked waiting for EOF. The comment here used to claim the stderr
	// drain prevented that, but the sequential read still parked on stdout
	// first. We fan both reads out to goroutines and join them so neither
	// side can wedge the other.
	type readResult struct {
		b   []byte
		err error
	}
	stdoutCh := make(chan readResult, 1)
	stderrCh := make(chan readResult, 1)
	go func() {
		b, err := io.ReadAll(sess.Stdout)
		stdoutCh <- readResult{b, err}
	}()
	go func() {
		b, err := io.ReadAll(sess.Stderr)
		stderrCh <- readResult{b, err}
	}()
	stdoutRes := <-stdoutCh
	// We still need to drain stderr (the channel slot buffers it) so the
	// child's stderr pipe never fills — pick it up before Wait().
	<-stderrCh
	if _, werr := sess.Wait(); werr != nil && stdoutRes.err == nil {
		stdoutRes.err = werr
	}
	return string(stdoutRes.b), stdoutRes.err
}

// metricsShellScript is a portable POSIX sh script that emits a single JSON
// object with the panel-friendly metric field names. It reads /proc inside
// the instance, so it works on any Linux container/VM regardless of the
// installed tooling (no `docker stats`, no `ps` parsing quirks, no jq). The
// caller is responsible for routing it through the instance's shell.
//
// Field mapping (panel expects these):
//
//	cpu_pct   – aggregate busy% over a ~0.2s /proc/stat delta
//	mem_used  – MemTotal-MemAvailable (bytes)
//	mem_total – MemTotal (bytes)
//	disk_used – used bytes on the filesystem holding "/" (stat -c)
//	disk_total– total bytes on the same filesystem
//	net_in    – rx bytes summed across /proc/net/dev interfaces
//	net_out   – tx bytes summed across /proc/net/dev interfaces
//	load1     – first field of /proc/loadavg
//	uptime    – seconds since boot (/proc/uptime, floored)
//
// Every number is coerced to an int/float literal; on any failure we emit 0
// rather than a malformed line so the panel always gets valid JSON.
//
// NOTE on /proc vs cgroup: /proc/stat and /proc/meminfo inside a plain
// docker container are NOT cgroup-isolated — they report the HOST's CPU and
// RAM, so the panel's Metrics page would surface the operator's VPS numbers
// (e.g. host's 2.0 GiB RAM as both mem_used and mem_total) instead of the
// container's. To avoid that, this script prefers the cgroupfs files mounted
// inside the namespace (a docker container's own cgroup, an LXD container's,
// or a VM's own hierarchy) for cpu_pct / mem_used / mem_total, and only falls
// back to /proc when cgroup isn't available (sandboxes without the mount) or
// when no memory limit is set (the ceiling then genuinely is the host's RAM,
// same as the VM-backed case where /proc/meminfo is already namespaced).
const metricsShellScript = `set +e

# Count online CPU threads visible inside this namespace. Used as the
# denominator for cgroup CPU% when no cgroup cpu quota is set.
count_cores() {
  if [ -r /proc/cpuinfo ]; then
    n=$(awk '/^processor[[:space:]]*:/{c++} END{print c+0}' /proc/cpuinfo)
    [ "$n" -gt 0 ] 2>/dev/null && { printf '%s' "$n"; return; }
  fi
  printf '1'
}

# ---- cgroup version detection ----------------------------------------------
# cgroupfs mounted inside the namespace reports the namespace's own usage.
# We prefer it over /proc because /proc on a plain docker container is the
# HOST's, surfacing VPS numbers as the instance's metrics. When cgroup isn't
# available we transparently fall back to /proc (correct for VMs that own
# their own kernel).
CGV=0
if [ -f /sys/fs/cgroup/cgroup.controllers ]; then
  CGV=2
elif [ -d /sys/fs/cgroup/memory ] || [ -r /sys/fs/cgroup/memory/memory.usage_in_bytes ]; then
  CGV=1
fi

# ---- CPU % -----------------------------------------------------------------
cpu=0
if [ "$CGV" = 2 ] && [ -r /sys/fs/cgroup/cpu.stat ]; then
  u1=$(awk '/^usage_usec[[:space:]]/{print $2}' /sys/fs/cgroup/cpu.stat); u1=${u1:-0}
  sleep 0.2
  u2=$(awk '/^usage_usec[[:space:]]/{print $2}' /sys/fs/cgroup/cpu.stat); u2=${u2:-0}
  cores=$(count_cores)
  if [ -r /sys/fs/cgroup/cpu.max ]; then
    read -r cmax cperiod < /sys/fs/cgroup/cpu.max
    if [ "$cmax" != "max" ] && [ -n "$cmax" ] && [ "$cperiod" -gt 0 ] 2>/dev/null; then
      cores=$(( cmax / cperiod )); [ "$cores" -lt 1 ] && cores=1
    fi
  fi
  [ "$cores" -lt 1 ] 2>/dev/null && cores=1
  cpu=$(awk -v u1="$u1" -v u2="$u2" -v c="$cores" 'BEGIN{ d=u2-u1; if(d<0)d=0; p=(d/1e6)/0.2/c*100; if(p<0)p=0; if(p>100)p=100; printf "%.1f", p }')
elif [ "$CGV" = 1 ] && [ -r /sys/fs/cgroup/cpuacct/cpuacct.usage ]; then
  u1=$(cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null); u1=${u1:-0}
  sleep 0.2
  u2=$(cat /sys/fs/cgroup/cpuacct/cpuacct.usage 2>/dev/null); u2=${u2:-0}
  cores=$(count_cores)
  if [ -r /sys/fs/cgroup/cpu/cpu.cfs_quota_us ]; then
    q=$(cat /sys/fs/cgroup/cpu/cpu.cfs_quota_us 2>/dev/null)
    per=$(cat /sys/fs/cgroup/cpu/cpu.cfs_period_us 2>/dev/null)
    if [ "$q" -gt 0 ] 2>/dev/null && [ "$per" -gt 0 ] 2>/dev/null; then
      cores=$(( q / per )); [ "$cores" -lt 1 ] && cores=1
    fi
  fi
  [ "$cores" -lt 1 ] 2>/dev/null && cores=1
  cpu=$(awk -v u1="$u1" -v u2="$u2" -v c="$cores" 'BEGIN{ d=u2-u1; if(d<0)d=0; p=(d/1e9)/0.2/c*100; if(p<0)p=0; if(p>100)p=100; printf "%.1f", p }')
elif [ -r /proc/stat ]; then
  read -r _ user1 nice1 sys1 idle1 iowait1 irq1 softirq1 steal1 guest1 guest_nice1 < /proc/stat
  busy1=$((user1+nice1+sys1+idle1+iowait1+irq1+softirq1+steal1+guest1+guest_nice1))
  idle1=$((idle1+iowait1))
  sleep 0.2
  read -r _ user2 nice2 sys2 idle2 iowait2 irq2 softirq2 steal2 guest2 guest_nice2 < /proc/stat
  busy2=$((user2+nice2+sys2+idle2+iowait2+irq2+softirq2+steal2+guest2+guest_nice2))
  idle2=$((idle2+iowait2))
  if [ "$busy2" -gt "$busy1" ] && [ "$((busy2-busy1))" -gt 0 ]; then
    cpu=$(( (busy2-busy1 - (idle2-idle1)) * 1000 / (busy2-busy1) ))
    cpu=$((cpu/10))
    [ "$cpu" -lt 0 ] && cpu=0
    [ "$cpu" -gt 100 ] && cpu=100
  fi
fi

# ---- Memory ---------------------------------------------------------------
# Prefer cgroup current usage (container's real footprint) and the cgroup
# limit as the total when one is set. When no limit is set ("max"/unlimited)
# fall back to /proc/meminfo MemTotal for the ceiling (for VMs that's the VM
# RAM; for an unlimited docker container it's the host RAM — the container
# genuinely has no lower cap).
mt=0; mu=0
mem_have_used=0
if [ "$CGV" = 2 ] && [ -r /sys/fs/cgroup/memory.current ]; then
  mu=$(cat /sys/fs/cgroup/memory.current 2>/dev/null); mu=${mu:-0}
  mem_have_used=1
  mmax=$(cat /sys/fs/cgroup/memory.max 2>/dev/null)
  if [ "$mmax" != "max" ] && [ -n "$mmax" ] && [ "$mmax" -gt 0 ] 2>/dev/null; then
    mt=$mmax
  fi
elif [ "$CGV" = 1 ] && [ -r /sys/fs/cgroup/memory/memory.usage_in_bytes ]; then
  mu=$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null); mu=${mu:-0}
  mem_have_used=1
  mmax=$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)
  # 9223372036854771712 and up is the "unlimited" sentinel across v1 kernels.
  if [ -n "$mmax" ] && [ "$mmax" -gt 0 ] 2>/dev/null && [ "$mmax" -lt 9223372036854771712 ] 2>/dev/null; then
    mt=$mmax
  fi
fi
if [ "$mt" -le 0 ] 2>/dev/null && [ -r /proc/meminfo ]; then
  pmt=$(awk '/^MemTotal:/{print $2}' /proc/meminfo); [ -z "$pmt" ] && pmt=0
  mt=$((pmt*1024))
  if [ "$mem_have_used" = 0 ]; then
    pma=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo); [ -z "$pma" ] && pma=0
    mu=$((mt-pma)); [ "$mu" -lt 0 ] && mu=0
  fi
fi
[ "$mt" -lt 0 ] 2>/dev/null && mt=0
[ "$mu" -lt 0 ] 2>/dev/null && mu=0

# ---- Disk (filesystem holding "/") ----------------------------------------
dt=0; du=0
dt=$(df -P / 2>/dev/null | awk 'NR==2{print $2}'); du=$(df -P / 2>/dev/null | awk 'NR==2{print $3}')
dt=$((dt*1024)); du=$((du*1024))

# ---- Network / load / uptime ----------------------------------------------
ni=0; no=0
if [ -r /proc/net/dev ]; then
  ni=$(awk 'NR>2 && $1!~/lo:/{s+=$2} END{print s+0}' /proc/net/dev)
  no=$(awk 'NR>2 && $1!~/lo:/{s+=$10} END{print s+0}' /proc/net/dev)
fi
l1=$(awk '{print $1}' /proc/loadavg 2>/dev/null); [ -z "$l1" ] && l1=0
up=$(awk '{print int($1)}' /proc/uptime 2>/dev/null); [ -z "$up" ] && up=0
printf '{"cpu_pct":%s,"mem_used":%d,"mem_total":%d,"disk_used":%d,"disk_total":%d,"net_in":%d,"net_out":%d,"load1":%s,"uptime":%d,"mem":%d,"disk":%d,"cpu":%s}\n' "$cpu" "$mu" "$mt" "$du" "$dt" "$ni" "$no" "$l1" "$up" "$mu" "$du" "$cpu"
`

// processesShellScript lists the running processes inside the instance via
// /proc, emitting the ProcessRow shape the panel expects:
//
//	[{"pid":1,"cmd":"…","name":"…","cpu":0,"mem":0,"rss":0,"user":"root"}, …]
//
// We avoid `ps` because alpine/distroless images frequently ship a BusyBox
// `ps` with no `-o` support, while /proc is always present on Linux.
//
// JSON robustness matters here more than terseness: a single process whose
// comm/cmdline/user contains a raw control byte used to break the whole
// array — normalizeJSON() then discarded the entire blob and the panel's
// Processes page rendered an empty "No processes reported" list even though
// the workload (e.g. a Minecraft server) was running fine. A control char is
// not hypothetical: kernel-thread comms, legacy java argv, daemon banners
// and locale-quirky usernames all surface them. So esc() escapes backslash
// and quote, renders tab as "\t", and strips every other C0 control byte,
// then the value is wrapped in explicit literal quotes (not via sed's ".*"
// trick, which emits empty on an empty line and left "cmd": dangling). It
// also resolves uid→username from /etc/passwd directly instead of forking
// `id -un` per process — a busy container with many tasks otherwise risks
// blowing the gatherViaShell 3s budget. cpu is reported as 0 (cheap, safe)
// and mem is the rss/MemTotal percentage in 0..100 so the panel's Memory
// column shows real numbers; the panel Processes page guards null cpu/mem.
const processesShellScript = `set +e
mt=0
if [ -r /proc/meminfo ]; then
  mt=$(awk '/^MemTotal:/{print $2}' /proc/meminfo 2>/dev/null)
  [ -z "$mt" ] && mt=0
fi
esc() {
  printf '%s' "$1" \
    | sed 's/\\/\\\\/g; s/"/\\"/g' \
    | sed 's/	/\\t/g' \
    | tr -d '\000\001\002\003\004\005\006\007\010\012\013\014\016\017\020\021\022\023\024\025\026\027\030\031\032\033\034\035\036\037'
}
printf '['
first=1
for d in /proc/[0-9]*; do
  pid=${d#/proc/}
  [ -r "$d/comm" ] || continue
  name=$(cat "$d/comm" 2>/dev/null)
  cmd=$(tr '\0' ' ' < "$d/cmdline" 2>/dev/null)
  [ -z "$cmd" ] && cmd=$name
  [ -z "$name" ] && name=$pid
  uid=$(awk '/^Uid:/{print $2}' "$d/status" 2>/dev/null); [ -z "$uid" ] && uid=0
  rssKb=$(awk '/^VmRSS:/{print $2}' "$d/status" 2>/dev/null); [ -z "$rssKb" ] && rssKb=0
  mem=0
  if [ "$mt" -gt 0 ] && [ "$rssKb" -gt 0 ]; then mem=$(( rssKb*100/mt )); fi
  rss=$((rssKb*1024))
  user=$(awk -F: -v u="$uid" '$3==u{print $1; exit}' /etc/passwd 2>/dev/null); [ -z "$user" ] && user=$uid
  [ "$first" -eq 1 ] && first=0 || printf ','
  printf '{"pid":%s,"cmd":"%s","name":"%s","cpu":0,"mem":%s,"rss":%d,"user":"%s"}' \
    "$pid" "$(esc "$cmd")" "$(esc "$name")" "$mem" "$rss" "$(esc "$user")"
done
printf ']\n'
`

// portsShellScript lists TCP/UDP sockets observed inside the instance. It
// reads /proc/net/tcp{,6},udp{,6}; emitting the PortRow shape:
//
//	[{"proto":"tcp","laddr":"0.0.0.0:25565","raddr":"0.0.0.0:0","state":"LISTEN"}, …]
//
// The state field uses the human label ("LISTEN"/"ESTABLISHED"/…) rather than
// the raw hex code in /proc/net.
//
// Implementation notes — the previous revision silently emitted "[]" on every
// Debian-based container, because it leaned on three non-portable constructs:
//
//   - bash substring ${h:off:len} inside hex2ip, which dash (the /bin/sh on
//     Debian/Ubuntu, i.e. nearly every game-server image) rejects as a "Bad
//     substitution", aborting the whole parse;
//   - `awk "strtonum(...)"`, a gawk-only function absent from mawk (Debian's
//     default awk) and BusyBox awk (Alpine/distroless), so the port decode
//     threw and awk exited early;
//   - calling a shell function (hex2ip) from inside awk via `cmd|getline`,
//     which executes the name as an external program — the function is never
//     found, getline fails, and the decoded IP stays empty (laddr became
//     ":25565" instead of "0.0.0.0:25565").
//
// The result was that the panel's Ports page always read "No listening sockets
// reported" even with a running Minecraft server bound to 25565. The rewrite
// stays in pure POSIX sh (cut -c for substrings, printf %d for hex->dec, no
// awk at all in the per-line decode), works under dash/ash/busybox sh and any
// awk-less environment, decodes both v4 (little-endian) and v6 (network order)
// addresses, and adds raddr (the frontend's "Remote" column) that the old
// script never populated.
const portsShellScript = `set +e
state_label() {
  case "$1" in
    01) echo "ESTABLISHED" ;; 02) echo "SYN_SENT" ;; 03) echo "SYN_RECV" ;;
    04) echo "FIN_WAIT1" ;; 05) echo "FIN_WAIT2" ;; 06) echo "TIME_WAIT" ;;
    07) echo "CLOSE" ;;    08) echo "CLOSE_WAIT" ;; 09) echo "LAST_ACK" ;;
    0A) echo "LISTEN" ;;   0B) echo "CLOSING" ;;
    *) echo "$1" ;;
  esac
}
# hex2ip4 decodes /proc/net/tcp little-endian hex AABBCCDD -> DD.CC.BB.AA.
# Uses cut -c for substring extraction (POSIX) rather than bash's ${h:off:len}
# (unsupported by dash as /bin/sh) and printf %d for hex->dec rather than
# awk's gawk-only strtonum.
hex2ip4() {
  h=$1
  b1=$(printf '%s' "$h" | cut -c7-8)
  b2=$(printf '%s' "$h" | cut -c5-6)
  b3=$(printf '%s' "$h" | cut -c3-4)
  b4=$(printf '%s' "$h" | cut -c1-2)
  printf '%d.%d.%d.%d' "0x$b1" "0x$b2" "0x$b3" "0x$b4"
}
# hex2ip6 groups the 32 hex chars of /proc/net/tcp6 into 4-char hextets in
# network (display) order; leading zeros are stripped per hextet.
hex2ip6() {
  h=$1
  i=1
  out=""
  while [ "$i" -le 32 ]; do
    seg=$(printf '%s' "$h" | cut -c${i}-$((i+3)))
    seg=$(printf '%s' "$seg" | sed 's/^0*//')
    [ -z "$seg" ] && seg="0"
    if [ -z "$out" ]; then out="$seg"; else out="$out:$seg"; fi
    i=$((i+4))
  done
  printf '%s' "$out"
}
parse_file() {
  proto=$1; file=$2; fam=$3
  out=""
  while IFS= read -r line; do
    # tokenize on whitespace; skip header ("sl local_address ...")
    set -- $line
    [ "$#" -lt 4 ] && continue
    case "$1" in
      sl | sl:) continue ;;
    esac
    local_addr=$2; remote_addr=$3; st=$4
    l_ip=${local_addr%%:*}; l_port=${local_addr#*:}
    r_ip=${remote_addr%%:*}; r_port=${remote_addr#*:}
    if [ "$fam" = "4" ]; then
      l_dip=$(hex2ip4 "$l_ip"); r_dip=$(hex2ip4 "$r_ip")
    else
      l_dip=$(hex2ip6 "$l_ip"); r_dip=$(hex2ip6 "$r_ip")
    fi
    l_port_dec=$(printf '%d' "0x$l_port" 2>/dev/null); [ -z "$l_port_dec" ] && l_port_dec=0
    r_port_dec=$(printf '%d' "0x$r_port" 2>/dev/null); [ -z "$r_port_dec" ] && r_port_dec=0
    state=$(state_label "$st")
    out="${out},{\"proto\":\"$proto\",\"laddr\":\"$l_dip:$l_port_dec\",\"raddr\":\"$r_dip:$r_port_dec\",\"state\":\"$state\"}"
  done < "$file" 2>/dev/null
  printf '%s' "$out"
}
printf '['
first=1
for f in /proc/net/tcp /proc/net/tcp6 /proc/net/udp /proc/net/udp6; do
  [ -r "$f" ] || continue
  case "$f" in
    *tcp6) proto=tcp; fam=6 ;;
    *udp6) proto=udp; fam=6 ;;
    *tcp) proto=tcp; fam=4 ;;
    *udp) proto=udp; fam=4 ;;
  esac
  chunk=$(parse_file "$proto" "$f" "$fam")
  [ -z "$chunk" ] && continue
  chunk=${chunk#,}
  [ "$first" -eq 1 ] && first=0 || printf ','
  printf '%s' "$chunk"
done
printf ']\n'
`

// gatherViaShell runs the metrics/processes/ports shell scripts inside the
// instance through the driver's Exec and returns the three blobs plus an
// empty info object. Drivers whose Exec can capture stdout pipe this in
// directly; the return values are already JSON strings.
func gatherViaShell(ctx context.Context, name string, drv Driver) (metrics, processes, ports, info string, err error) {
	info = "{}"

	mctx, mcancel := context.WithTimeout(ctx, 2*time.Second)
	defer mcancel()
	metrics, err = runInsideExec(mctx, name, drv, []string{"/bin/sh", "-c", metricsShellScript}, 2*time.Second)
	if err != nil {
		metrics = normalizeJSON(metrics)
		return metrics, "[]", "[]", info, fmt.Errorf("metrics: %w", err)
	}
	metrics = normalizeJSON(metrics)

	pctx, pcancel := context.WithTimeout(ctx, 3*time.Second)
	defer pcancel()
	processes, _ = runInsideExec(pctx, name, drv, []string{"/bin/sh", "-c", processesShellScript}, 3*time.Second)
	processes = normalizeJSON(processes)
	if processes == "" {
		processes = "[]"
	}

	tctx, tcancel := context.WithTimeout(ctx, 2*time.Second)
	defer tcancel()
	ports, _ = runInsideExec(tctx, name, drv, []string{"/bin/sh", "-c", portsShellScript}, 2*time.Second)
	ports = normalizeJSON(ports)
	if ports == "" {
		ports = "[]"
	}
	return metrics, processes, ports, info, nil
}

// normalizeJSON trims surrounding whitespace and, if the string isn't valid
// JSON, replaces it with the safe empty form for the caller's expected shape.
// We keep it permissive — a half-printed line still yields "{}"/"[]" instead
// of corrupting the panel's live-state cache.
func normalizeJSON(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return s
	}
	var js json.RawMessage
	if json.Unmarshal([]byte(s), &js) != nil {
		return ""
	}
	return s
}

// parseInt is a small helper for drivers parsing CLI numeric output; it never
// panics and returns 0 on any failure.
func parseInt(s string) int64 {
	s = strings.TrimSpace(s)
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

// sentinel keeps the unused-import check honest if a future edit drops the
// only reference to exec.CommandContext down here.
var _ = exec.CommandContext
