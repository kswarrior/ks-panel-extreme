import React from 'react';
import { glassFieldClass } from '@/shared/components/ui/Field';
import type { Advanced, KvRuntime, MpRuntime, LxdRuntime, NetworkMode, RestartPolicy, LogLevel, LogDriver, DriverKind } from '@/features/templates/types/templateForm';

export interface AdvancedInput extends Advanced {}
export interface KvRuntimeInput extends KvRuntime {}
export interface MpRuntimeInput extends MpRuntime {}
export interface LxdRuntimeInput extends LxdRuntime {}

export interface RuntimeSectionProps {
  kind: DriverKind;
  advanced: AdvancedInput;
  onAdvancedUpdate: (patch: Partial<AdvancedInput>) => void;
  onKvmRuntimeUpdate: (patch: Partial<KvRuntimeInput>) => void;
  onMpRuntimeUpdate: (patch: Partial<MpRuntimeInput>) => void;
  onLxdRuntimeUpdate: (patch: Partial<LxdRuntimeInput>) => void;
  sectionCls: string;
  labelCls: string;
  monoCls: string;
  addBtn: string;
}

export const TemplateRuntimeSection: React.FC<RuntimeSectionProps> = ({
  kind,
  advanced,
  onAdvancedUpdate,
  onKvmRuntimeUpdate,
  onMpRuntimeUpdate,
  onLxdRuntimeUpdate,
  sectionCls,
  labelCls,
  monoCls,
  addBtn,
}) => {
  const runtimeTitle = kind === 'docker' ? 'Container Runtime' : 
    kind === 'kvm' ? 'KVM Runtime' : 
    kind === 'multipass' ? 'Multipass Runtime' : 'LXD Runtime';

  return (
    <>
      {/* Section F: Runtime Config (driver-specific) */}
      <div className={sectionCls}>
        <h4 className="text-sm font-semibold uppercase tracking-wide text-gray-400 mb-1">
          Section F · {runtimeTitle}
        </h4>

        {kind === 'docker' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Startup command</label>
                <input value={advanced.startup_command} onChange={(e) => onAdvancedUpdate({ startup_command: e.target.value })} placeholder="/start.sh or ./server --world {{WORLD}}" className={glassFieldClass} />
              </div>
              <div>
                <label className={labelCls}>Stop command</label>
                <input value={advanced.stop_command} onChange={(e) => onAdvancedUpdate({ stop_command: e.target.value })} placeholder="stop" className={glassFieldClass} />
              </div>
              <div>
                <label className={labelCls}>Stop signal</label>
                <input value={advanced.stop_signal} onChange={(e) => onAdvancedUpdate({ stop_signal: e.target.value })} placeholder="SIGTERM" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Working directory</label>
                <input value={advanced.working_dir} onChange={(e) => onAdvancedUpdate({ working_dir: e.target.value })} placeholder="/home/container" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Container user</label>
                <input value={advanced.user} onChange={(e) => onAdvancedUpdate({ user: e.target.value })} placeholder="1000:1000" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Hostname</label>
                <input value={advanced.hostname} onChange={(e) => onAdvancedUpdate({ hostname: e.target.value })} placeholder="container hostname" className={glassFieldClass} />
              </div>
              <div>
                <label className={labelCls}>Network mode</label>
                <select value={advanced.network_mode} onChange={(e) => onAdvancedUpdate({ network_mode: e.target.value as NetworkMode })} className={glassFieldClass}>
                  <option value="bridge">bridge (default)</option>
                  <option value="host">host</option>
                  <option value="none">none</option>
                  <option value="container">container</option>
                  <option value="macvlan">macvlan</option>
                  <option value="ipvlan">ipvlan</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Restart policy</label>
                <select value={advanced.restart_policy} onChange={(e) => onAdvancedUpdate({ restart_policy: e.target.value as RestartPolicy })} className={glassFieldClass}>
                  <option value="no">no</option>
                  <option value="always">always</option>
                  <option value="unless-stopped">unless-stopped</option>
                  <option value="on-failure">on-failure</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>shm-size (MB)</label>
                <input value={advanced.shm_size_mb} onChange={(e) => onAdvancedUpdate({ shm_size_mb: e.target.value })} placeholder="64" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>PIDs limit</label>
                <input value={advanced.pid_limit} onChange={(e) => onAdvancedUpdate({ pid_limit: e.target.value })} placeholder="100" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>ulimit nofiles</label>
                <input value={advanced.ulimit_nofiles} onChange={(e) => onAdvancedUpdate({ ulimit_nofiles: e.target.value })} placeholder="65536" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>ulimit nproc</label>
                <input value={advanced.ulimit_nproc} onChange={(e) => onAdvancedUpdate({ ulimit_nproc: e.target.value })} placeholder="unlimited" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>CPU quota period (µs)</label>
                <input value={advanced.cpu_quota_period} onChange={(e) => onAdvancedUpdate({ cpu_quota_period: e.target.value })} placeholder="100000" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>I/O weight (10-1000)</label>
                <input value={advanced.io_weight} onChange={(e) => onAdvancedUpdate({ io_weight: e.target.value })} placeholder="500" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>DNS servers (comma)</label>
                <input value={advanced.dns} onChange={(e) => onAdvancedUpdate({ dns: e.target.value })} placeholder="1.1.1.1, 8.8.8.8" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Log driver</label>
                <select value={advanced.log_driver} onChange={(e) => onAdvancedUpdate({ log_driver: e.target.value as LogDriver })} className={glassFieldClass}>
                  <option value="json-file">json-file</option>
                  <option value="syslog">syslog</option>
                  <option value="journald">journald</option>
                  <option value="none">none</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Log max size (MB)</label>
                <input value={advanced.log_max_size_mb} onChange={(e) => onAdvancedUpdate({ log_max_size_mb: e.target.value })} placeholder="10" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Log max files</label>
                <input value={advanced.log_max_files} onChange={(e) => onAdvancedUpdate({ log_max_files: e.target.value })} placeholder="3" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Log level</label>
                <select value={advanced.log_level} onChange={(e) => onAdvancedUpdate({ log_level: e.target.value as LogLevel })} className={glassFieldClass}>
                  <option value="info">info</option>
                  <option value="debug">debug</option>
                  <option value="warn">warn</option>
                  <option value="error">error</option>
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Extra hosts (/etc/hosts lines)</label>
              <textarea rows={2} value={advanced.extra_hosts} onChange={(e) => onAdvancedUpdate({ extra_hosts: e.target.value })} placeholder={"host.docker.internal host-gateway\napi.local 10.0.0.5"} className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Environment template (rendered at deploy time)</label>
              <textarea rows={2} value={advanced.environment_template} onChange={(e) => onAdvancedUpdate({ environment_template: e.target.value })} placeholder={"KEY={{VAR}}\nLANG=C.UTF-8"} className={monoCls} />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onAdvancedUpdate({ privileged: !advanced.privileged })} className={`relative w-9 h-5 rounded-full transition ${advanced.privileged ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.privileged}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.privileged ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Privileged</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onAdvancedUpdate({ readonly_rootfs: !advanced.readonly_rootfs })} className={`relative w-9 h-5 rounded-full transition ${advanced.readonly_rootfs ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.readonly_rootfs}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.readonly_rootfs ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Read-only rootfs</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onAdvancedUpdate({ enable_tty: !advanced.enable_tty })} className={`relative w-9 h-5 rounded-full transition ${advanced.enable_tty ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.enable_tty}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.enable_tty ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Allocate TTY</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onAdvancedUpdate({ oom_kill_disable: !advanced.oom_kill_disable })} className={`relative w-9 h-5 rounded-full transition ${advanced.oom_kill_disable ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.oom_kill_disable}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.oom_kill_disable ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Disable OOM killer</span>
              </label>
            </div>
          </>
        )}

        {kind === 'kvm' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>vCPUs</label>
                <input value={advanced.kvm.vcpus} onChange={(e) => onKvmRuntimeUpdate({ vcpus: e.target.value })} placeholder="2" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>CPU Model</label>
                <select value={advanced.kvm.cpu_model} onChange={(e) => onKvmRuntimeUpdate({ cpu_model: e.target.value as KvRuntimeInput['cpu_model'] })} className={glassFieldClass}>
                  <option value="host-passthrough">host-passthrough</option>
                  <option value="host-model">host-model</option>
                  <option value="kvm64">kvm64</option>
                  <option value="">default</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Machine Type</label>
                <select value={advanced.kvm.machine} onChange={(e) => onKvmRuntimeUpdate({ machine: e.target.value as KvRuntimeInput['machine'] })} className={glassFieldClass}>
                  <option value="pc">pc (i440fx)</option>
                  <option value="q35">q35</option>
                  <option value="virt">virt (ARM)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Disk Bus</label>
                <select value={advanced.kvm.disk_bus} onChange={(e) => onKvmRuntimeUpdate({ disk_bus: e.target.value as KvRuntimeInput['disk_bus'] })} className={glassFieldClass}>
                  <option value="virtio">virtio</option>
                  <option value="sata">sata</option>
                  <option value="ide">ide</option>
                  <option value="nvme">nvme</option>
                  <option value="scsi">scsi</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Disk Cache</label>
                <select value={advanced.kvm.disk_cache} onChange={(e) => onKvmRuntimeUpdate({ disk_cache: e.target.value as KvRuntimeInput['disk_cache'] })} className={glassFieldClass}>
                  <option value="writeback">writeback</option>
                  <option value="none">none</option>
                  <option value="writethrough">writethrough</option>
                  <option value="directsync">directsync</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Boot Order</label>
                <select value={advanced.kvm.boot_order} onChange={(e) => onKvmRuntimeUpdate({ boot_order: e.target.value as KvRuntimeInput['boot_order'] })} className={glassFieldClass}>
                  <option value="cd">CD-ROM</option>
                  <option value="hd">Hard Disk</option>
                  <option value="net">Network (PXE)</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>VGA</label>
                <select value={advanced.kvm.vga} onChange={(e) => onKvmRuntimeUpdate({ vga: e.target.value as KvRuntimeInput['vga'] })} className={glassFieldClass}>
                  <option value="virtio">virtio</option>
                  <option value="std">std (cirrus)</option>
                  <option value="qxl">qxl</option>
                  <option value="none">none</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Video Memory (MB)</label>
                <input value={advanced.kvm.video_memory_mb} onChange={(e) => onKvmRuntimeUpdate({ video_memory_mb: e.target.value })} placeholder="16" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>VNC Port</label>
                <input value={advanced.kvm.vnc_port} onChange={(e) => onKvmRuntimeUpdate({ vnc_port: e.target.value })} placeholder="auto" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>VNC Password</label>
                <input value={advanced.kvm.vnc_password} onChange={(e) => onKvmRuntimeUpdate({ vnc_password: e.target.value })} type="password" placeholder="optional" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>SPICE Port</label>
                <input value={advanced.kvm.spice_port} onChange={(e) => onKvmRuntimeUpdate({ spice_port: e.target.value })} placeholder="auto" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Kernel Args</label>
                <input value={advanced.kvm.kernel_args} onChange={(e) => onKvmRuntimeUpdate({ kernel_args: e.target.value })} placeholder="console=ttyS0" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Extra QEMU Args</label>
                <input value={advanced.kvm.extra_args} onChange={(e) => onKvmRuntimeUpdate({ extra_args: e.target.value })} placeholder="-device ..." className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Install ISO Path</label>
                <input value={advanced.kvm.install_iso} onChange={(e) => onKvmRuntimeUpdate({ install_iso: e.target.value })} placeholder="/path/to/ubuntu.iso" className={monoCls} />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ uefi: !advanced.kvm.uefi })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.uefi ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.uefi}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.uefi ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">UEFI</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ secure_boot: !advanced.kvm.secure_boot })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.secure_boot ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.secure_boot}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.secure_boot ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Secure Boot</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ tpm: !advanced.kvm.tpm })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.tpm ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.tpm}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.tpm ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">TPM</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ io_thread: !advanced.kvm.io_thread })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.io_thread ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.io_thread}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.io_thread ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">IO Thread</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ discard: !advanced.kvm.discard })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.discard ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.discard}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.discard ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Discard (TRIM)</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ numa: !advanced.kvm.numa })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.numa ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.numa}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.numa ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">NUMA</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ hugepages: !advanced.kvm.hugepages })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.hugepages ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.hugepages}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.hugepages ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Hugepages</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onKvmRuntimeUpdate({ rdm_reservation: !advanced.kvm.rdm_reservation })} className={`relative w-9 h-5 rounded-full transition ${advanced.kvm.rdm_reservation ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.kvm.rdm_reservation}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.kvm.rdm_reservation ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">RDM Reservation</span>
              </label>
            </div>
          </>
        )}

        {kind === 'multipass' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>CPUs</label>
                <input value={advanced.multipass.cpus} onChange={(e) => onMpRuntimeUpdate({ cpus: e.target.value })} placeholder="2" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Memory (MB)</label>
                <input value={advanced.multipass.mem_mb} onChange={(e) => onMpRuntimeUpdate({ mem_mb: e.target.value })} placeholder="1024" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Disk (MB)</label>
                <input value={advanced.multipass.disk_mb} onChange={(e) => onMpRuntimeUpdate({ disk_mb: e.target.value })} placeholder="10240" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Image Alias</label>
                <input value={advanced.multipass.image_alias} onChange={(e) => onMpRuntimeUpdate({ image_alias: e.target.value })} placeholder="ubuntu-lts, jammy, noble" className={glassFieldClass} />
              </div>
              <div>
                <label className={labelCls}>Bridges (comma-separated)</label>
                <input value={advanced.multipass.bridges} onChange={(e) => onMpRuntimeUpdate({ bridges: e.target.value })} placeholder="br0,br1" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Bridged Interface</label>
                <input value={advanced.multipass.bridged} onChange={(e) => onMpRuntimeUpdate({ bridged: e.target.value })} placeholder="eth0" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Launch Argument</label>
                <input value={advanced.multipass.launch_argument} onChange={(e) => onMpRuntimeUpdate({ launch_argument: e.target.value })} placeholder="--cloud-init ..." className={monoCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Cloud-Init UserData (YAML)</label>
              <textarea rows={6} value={advanced.multipass.cloud_init_userdata} onChange={(e) => onMpRuntimeUpdate({ cloud_init_userdata: e.target.value })} placeholder="#cloud-config\nusers:\n  - name: ubuntu\n    sudo: ALL=(ALL) NOPASSWD:ALL\n    ssh-authorized-keys:\n      - ssh-rsa AAAA..." className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Cloud-Init MetaData (YAML)</label>
              <textarea rows={4} value={advanced.multipass.cloud_init_metadata} onChange={(e) => onMpRuntimeUpdate({ cloud_init_metadata: e.target.value })} placeholder="instance-id: my-vm\nlocal-hostname: my-vm" className={monoCls} />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onMpRuntimeUpdate({ autorecovery: !advanced.multipass.autorecovery })} className={`relative w-9 h-5 rounded-full transition ${advanced.multipass.autorecovery ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.multipass.autorecovery}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.multipass.autorecovery ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Auto Recovery</span>
              </label>
            </div>
          </>
        )}

        {kind === 'lxd' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Profiles (comma-separated)</label>
                <input value={advanced.lxd.profiles} onChange={(e) => onLxdRuntimeUpdate({ profiles: e.target.value })} placeholder="default,privileged" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Storage Pool</label>
                <input value={advanced.lxd.storage_pool} onChange={(e) => onLxdRuntimeUpdate({ storage_pool: e.target.value })} placeholder="default" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Storage Volume Size</label>
                <input value={advanced.lxd.storage_volume_size} onChange={(e) => onLxdRuntimeUpdate({ storage_volume_size: e.target.value })} placeholder="10GB" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>CPU Allowance</label>
                <input value={advanced.lxd.limits_cpu_allowance} onChange={(e) => onLxdRuntimeUpdate({ limits_cpu_allowance: e.target.value })} placeholder="200%" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>CPU Priority</label>
                <input value={advanced.lxd.limits_cpu_priority} onChange={(e) => onLxdRuntimeUpdate({ limits_cpu_priority: e.target.value })} placeholder="0" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Raw ID Map</label>
                <input value={advanced.lxd.raw_idmap} onChange={(e) => onLxdRuntimeUpdate({ raw_idmap: e.target.value })} placeholder="both 1000 1000" className={monoCls} />
              </div>
              <div>
                <label className={labelCls}>Snapshot Pattern</label>
                <input value={advanced.lxd.snapshot_pattern} onChange={(e) => onLxdRuntimeUpdate({ snapshot_pattern: e.target.value })} placeholder="backup-{{timestamp}}" className={monoCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Config (key=value, one per line)</label>
              <textarea rows={4} value={advanced.lxd.config} onChange={(e) => onLxdRuntimeUpdate({ config: e.target.value })} placeholder="security.nesting=true\nlimits.memory=2GB\nuser.foo=bar" className={monoCls} />
            </div>
            <div>
              <label className={labelCls}>Devices (name JSON, one per line)</label>
              <textarea rows={4} value={advanced.lxd.devices} onChange={(e) => onLxdRuntimeUpdate({ devices: e.target.value })} placeholder='mygpu {"type":"gpu","gputype":"physical"}\nmyusb {"type":"usb","vendorid":"1234","productid":"5678"}' className={monoCls} />
            </div>
            <div className="flex flex-wrap gap-4 pt-1">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onLxdRuntimeUpdate({ security_protection: !advanced.lxd.security_protection })} className={`relative w-9 h-5 rounded-full transition ${advanced.lxd.security_protection ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.lxd.security_protection}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.lxd.security_protection ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Security Protection</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onLxdRuntimeUpdate({ security_privileged: !advanced.lxd.security_privileged })} className={`relative w-9 h-5 rounded-full transition ${advanced.lxd.security_privileged ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.lxd.security_privileged}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.lxd.security_privileged ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Security Privileged</span>
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <button type="button" onClick={() => onLxdRuntimeUpdate({ boot_autostart: !advanced.lxd.boot_autostart })} className={`relative w-9 h-5 rounded-full transition ${advanced.lxd.boot_autostart ? 'bg-green-600' : 'bg-neutral-700'}`} aria-pressed={advanced.lxd.boot_autostart}>
                  <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition ${advanced.lxd.boot_autostart ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-300">Boot Autostart</span>
              </label>
            </div>
          </>
        )}
      </div>
    </>
  );
};