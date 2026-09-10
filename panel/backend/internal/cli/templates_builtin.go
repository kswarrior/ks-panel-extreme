package cli

import "strings"

// builtinTemplate is one canned template the `import:template` CLI can drop
// into the database. The Name doubles as the import key the operator types
// (`kspanel import:template minecraft`), so it must be lowercase / hyphenated
// and stable — renaming a key would orphan every previously-imported row.
type builtinTemplate struct {
	Key         string
	Name        string
	Description string
	Kind        string
	Image       string
	Spec        string
}

// builtinTemplates is the canonical, code-owned catalog of ready-made
// blueprints. `import:template <key>` looks a name up here (case-insensitive)
// and inserts/updates the matching row in the `templates` table so it shows
// up on the Templates admin page without the operator having to hand-write
// the YAML spec.
//
// Specs mirror the shape ksedge's drivers consume (see ksedge/internal/drivers):
//
//	docker  -> { ports, env, limits, command, restart, mounts }
//	lxd     -> { profile, config, … }
//	kvm     -> { image, disks, … }
//	multipass -> { image, cpus, memory, disk, … }
var builtinTemplates = []builtinTemplate{
	{
		Key:         "minecraft",
		Name:        "Minecraft",
		Description: "Paper Minecraft 1.21.10 on Eclipse Temurin 21 JRE with autostart. Install downloads server.jar into the /mc bind-mount and writes eula.txt; the container command waits for install to complete then runs `java -Xmx1500M -jar server.jar --nogui` directly (no manual action button). The /mc world directory is bind-mounted to a host path so the File Manager can browse it and server.jar + the world survive container restarts. Ships two named runtimes (Java 21 default, Java 17 for older plugins) — pick one at deploy time.",
		Kind:        "docker",
		Image:       "eclipse-temurin:21-jre",
		Spec: `category: game
type: minecraft
ports:
- host: '25565'
  container: '25565'
  protocol: tcp
mounts:
- source: /var/lib/kspanel/instances/%INSTANCE_NAME%/mc
  target: /mc
  mode: rw
command:
- sh
- -c
- while [ ! -f /mc/.install-complete ]; do sleep 1; done; cd /mc && exec java -Xmx1500M -Dterminal.jline=false -Dterminal.ansi=true -jar server.jar --nogui
restart: 'no'
limits:
  memory: 4096M
  cpus: '2'
  disk: 10240M
  memory-swap: ''
images:
- name: Java 21
  image: eclipse-temurin:21-jre
  description: Eclipse Temurin 21 JRE (LTS, default)
  default: true
- name: Java 17
  image: eclipse-temurin:17-jre
  description: Eclipse Temurin 17 JRE (older plugins)
install:
- action: download
  command: ''
  url: https://fill-data.papermc.io/v1/objects/158703f75a26f842ea656b3dc6d75bf3d1ec176b97a2c36384d0b80b3871af53/paper-1.21.10-130.jar
  filename: /mc/server.jar
  archive: ''
  dest: ''
  from: ''
  to: ''
  path: ''
  content: ''
  branch: ''
  retries: ''
  ignore_errors: false
- action: write
  command: ''
  url: ''
  filename: ''
  archive: ''
  dest: ''
  from: ''
  to: ''
  path: /mc/eula.txt
  content: eula=true
  branch: ''
  retries: ''
  ignore_errors: false
- action: shell
  command: touch /mc/.install-complete
  url: ''
  filename: ''
  archive: ''
  dest: ''
  from: ''
  to: ''
  path: ''
  content: ''
  branch: ''
  retries: ''
  ignore_errors: false
instance_controls:
  show_info_row: true
  show_cpu: true
  show_ram: true
  show_disk: true
  allow_start: true
  allow_stop: true
  allow_restart: true
  allow_kill: true
  allow_template_actions: true
  show_details_tab: true
  show_monitoring_tab: true
  show_manage_tab: true
  show_activity_tab: true
  default_tab: details
  more_page: overview
  allow_rename: true
  allow_edit_advanced: true
  allow_reinstall: true
  allow_destroy: true
  allow_external_id_copy: true
  allow_node_link: true
  allow_template_link: true
  shortcuts:
    files:
      show: true
      slug: files
      label: Files
      icon_svg: ''
      icon_color: '#fbbf24'
      show_sftp: true
      show_header: true
      allow_edit: true
      terminal_allow_multi: true
      terminal_max: '4'
      terminal_default_stop_on_exit: true
      terminal_default_allow_input: all
      terminal_default_timeout_s: ''
      terminal_input_mode: direct
      terminal_shortcuts_enabled: false
      terminal_shortcuts: []
      default_terminals: []
    terminal:
      show: true
      slug: terminal
      label: Terminal
      icon_svg: ''
      icon_color: '#34d399'
      show_sftp: true
      show_header: true
      allow_edit: true
      terminal_allow_multi: true
      terminal_max: '4'
      terminal_default_stop_on_exit: true
      terminal_default_allow_input: all
      terminal_default_timeout_s: ''
      terminal_input_mode: direct
      terminal_shortcuts_enabled: true
      terminal_shortcuts:
      - label: TPS
        command: tps
      - label: op
        command: op ${MC_USERNAME}
      default_terminals:
      - name: Main
        id: mc-console
    ports:
      show: true
      slug: ports
      label: Ports
      icon_svg: ''
      icon_color: '#38bdf8'
      show_sftp: true
      show_header: true
      allow_edit: true
      terminal_allow_multi: true
      terminal_max: '4'
      terminal_default_stop_on_exit: true
      terminal_default_allow_input: all
      terminal_default_timeout_s: ''
      terminal_input_mode: direct
      terminal_shortcuts_enabled: false
      terminal_shortcuts: []
      default_terminals: []
    env:
      show: true
      slug: env
      label: Env
      icon_svg: ''
      icon_color: '#fb7185'
      show_sftp: true
      show_header: true
      allow_edit: true
      terminal_allow_multi: true
      terminal_max: '4'
      terminal_default_stop_on_exit: true
      terminal_default_allow_input: all
      terminal_default_timeout_s: ''
      terminal_input_mode: direct
      terminal_shortcuts_enabled: false
      terminal_shortcuts: []
      default_terminals: []
home_page: overview
advanced:
  startup_command: while [ ! -f /mc/.install-complete ]; do sleep 1; done; cd /mc && exec java -Xmx1500M -Dterminal.jline=false -Dterminal.ansi=true -jar server.jar --nogui
  startup_terminal_id: mc-console
  stop_command: ''
  stop_signal: ''
  working_dir: ''
  user: ''
  hostname: ''
  privileged: false
  readonly_rootfs: false
  enable_tty: false
  dns: []
  extra_hosts: []
  network_mode: bridge
  restart_policy: 'no'
  shm_size: ''
  pids_limit: ''
  ulimits:
    nofiles: ''
    nproc: ''
  logging:
    driver: json-file
    max_size: ''
    max_files: ''
    level: info
  oom_kill_disable: false
  cpu_quota_period: ''
  io_weight: ''
  environment_template: ''
  kvm:
    vcpus: '2'
    cpu_model: host-passthrough
    machine: q35
    uefi: true
    secure_boot: false
    tpm: false
    vga: virtio
    video_memory: '16'
    boot_order: hd
    kernel_args: ''
    extra_args: ''
    vnc_port: ''
    vnc_password: ''
    spice_port: ''
    install_iso: ''
    disk_bus: virtio
    disk_cache: writeback
    io_thread: true
    discard: true
    numa: false
    hugepages: false
    rdm_reservation: false
  multipass:
    cpus: '2'
    disk: 10240M
    memory: 1024M
    cloud_init_userdata: ''
    cloud_init_metadata: ''
    image_alias: ''
    bridges: []
    bridged: ''
    launch_argument: ''
    autorecovery: true
  lxd:
    profiles:
    - default
    storage_pool: default
    storage_volume_size: ''
    config: {}
    devices: {}
    limits_cpu_allowance: ''
    limits_cpu_priority: '0'
    security_protection: true
    security_privileged: false
    raw_idmap: ''
    boot_autostart: true
    snapshot_pattern: ''
`,
	},
	{
		Key:         "nginx",
		Name:        "Nginx",
		Description: "Nginx web server on port 80 (mapped to host 8080).",
		Kind:        "docker",
		Image:       "nginx:alpine",
		Spec: `category: web
type: nginx
ports:
- host: 8080
  container: 80
  protocol: tcp
limits:
  cpus: '1'
  memory: 256m
restart: unless-stopped
`,
	},
	{
		Key:         "ubuntu-vm",
		Name:        "Ubuntu VM",
		Description: "Ubuntu 22.04 KVM virtual machine.",
		Kind:        "kvm",
		Image:       "ubuntu-22.04",
		Spec: `category: vm
type: ubuntu
cpus: 2
memory: 2G
disk: 20G
`,
	},
	{
		Key:         "ubuntu-multipass",
		Name:        "Ubuntu Multipass",
		Description: "Ubuntu 22.04 VM driven by Multipass.",
		Kind:        "multipass",
		Image:       "22.04",
		Spec: `category: vm
type: ubuntu
cpus: 2
memory: 2G
disk: 20G
`,
	},
	{
		Key:         "alpine-lxd",
		Name:        "Alpine LXD",
		Description: "Alpine 3.19 system container via LXD. The image references the public linuxcontainers.org 'images:' remote so `lxc launch` auto-pulls without the operator having to add a remote or pre-stage the image locally. Built profile 'default' is what `lxc profile` ships by default.",
		Kind:        "lxd",
		Image:       "images:alpine/3.19",
		Spec: `category: container
type: alpine
profile: default
`,
	},
}

// findBuiltinTemplate looks up a canned template by key (case-insensitive,
// trimmed). Returns nil when no canned template matches, so the CLI can print
// the available keys instead of a confusing "not found" on a typo.
func findBuiltinTemplate(key string) *builtinTemplate {
	key = strings.TrimSpace(strings.ToLower(key))
	for i := range builtinTemplates {
		if strings.EqualFold(builtinTemplates[i].Key, key) {
			return &builtinTemplates[i]
		}
	}
	return nil
}
