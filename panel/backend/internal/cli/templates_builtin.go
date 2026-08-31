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
// the JSON spec.
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
		Description: "Vanilla Minecraft server on the Eclipse Temurin 21 JRE. The install workflow downloads the official server.jar into the /mc bind-mount and writes eula.txt; once install completes the panel stops the container, so the operator must explicitly click the 'Start Java' action button on the instance home page to launch `java -jar server.jar`. Auto-start-instance is enabled on the action so a stopped container is started first, then the action runs java inside; auto-stop-on-exit ensures the container is torn down again when the java process exits (so a crashed server doesn't leave a half-idle container). The /mc world directory is bind-mounted to a host path so the File Manager can browse it and server.jar + the world survive container restarts.",
		Kind:        "docker",
		Image:       "eclipse-temurin:21-jre",
		Spec: `{
  "category": "game",
  "type": "minecraft",
  "ports": [
    { "host": 25565, "container": 25565, "protocol": "tcp" }
  ],
  "limits": {
    "cpus": "2",
    "memory": "2g",
    "disk": "10g"
  },
  "mounts": [
    { "host": "/var/lib/kspanel/instances/%INSTANCE_NAME%/mc", "container": "/mc", "mode": "rw" }
  ],
  "command": [
    "sh",
    "-c",
    "while [ ! -f /mc/.install-complete ]; do sleep 1; done; sleep infinity"
  ],
  "restart": "no",
  "install": [
    {
      "action": "download",
      "url": "https://fill-data.papermc.io/v1/objects/158703f75a26f842ea656b3dc6d75bf3d1ec176b97a2c36384d0b80b3871af53/paper-1.21.10-130.jar",
      "filename": "/mc/server.jar"
    },
    {
      "action": "write",
      "path": "/mc/eula.txt",
      "content": "eula=true"
    },
    {
      "action": "shell",
      "command": "touch /mc/.install-complete"
    }
  ],
  "actions": [
    {
      "id": "start_java",
      "name": "Start Java",
      "description": "Launch java -Xmx1500M -jar server.jar --nogui inside the container. If the container is stopped, the panel starts it first; once java exits the container is stopped automatically.",
      "session": "long_running",
      "auto_start_instance": true,
      "auto_stop_on_exit": true,
      "restart_on_failure": true,
      "user_invokable": true,
      "allowed_states": "",
      "requires_online": false,
      "async_run": false,
      "run_on_create": false,
      "cooldown_s": "0",
      "allowed_commands": "",
      "blocked_commands": "",
"max_runtime_s": "",
       "stop_command": "stop",
       "stop_mode": "same",
       "steps": [
        { "action": "shell", "command": "cd /mc && exec java -Xmx1500M -jar server.jar --nogui" }
      ]
    }
  ]
}`,
	},
	{
		Key:         "nginx",
		Name:        "Nginx",
		Description: "Nginx web server on port 80 (mapped to host 8080).",
		Kind:        "docker",
		Image:       "nginx:alpine",
		Spec: `{
  "category": "web",
  "type": "nginx",
  "ports": [
    { "host": 8080, "container": 80, "protocol": "tcp" }
  ],
  "limits": {
    "cpus": "1",
    "memory": "256m"
  },
  "restart": "unless-stopped"
}`,
	},
	{
		Key:         "ubuntu-vm",
		Name:        "Ubuntu VM",
		Description: "Ubuntu 22.04 KVM virtual machine.",
		Kind:        "kvm",
		Image:       "ubuntu-22.04",
		Spec: `{
  "category": "vm",
  "type": "ubuntu",
  "cpus": 2,
  "memory": "2G",
  "disk": "20G"
}`,
	},
	{
		Key:         "ubuntu-multipass",
		Name:        "Ubuntu Multipass",
		Description: "Ubuntu 22.04 VM driven by Multipass.",
		Kind:        "multipass",
		Image:       "22.04",
		Spec: `{
  "category": "vm",
  "type": "ubuntu",
  "cpus": 2,
  "memory": "2G",
  "disk": "20G"
}`,
	},
	{
		Key:         "alpine-lxd",
		Name:        "Alpine LXD",
		Description: "Alpine 3.19 system container via LXD. The image references the public linuxcontainers.org 'images:' remote so `lxc launch` auto-pulls without the operator having to add a remote or pre-stage the image locally. Built profile 'default' is what `lxc profile` ships by default.",
		Kind:        "lxd",
		Image:       "images:alpine/3.19",
		Spec: `{
  "category": "container",
  "type": "alpine",
  "profile": "default"
}`,
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
