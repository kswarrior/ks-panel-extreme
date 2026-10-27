# Drivers (edge reference)

Kinds: docker, lxd, kvm, multipass, host.

Availability detection:
- docker: docker/dockerd/podman on PATH.
- kvm: virsh AND virt-install.
- multipass: multipass.
- lxd: lxd or lxc.
- host: always true.

Interface methods: Name, Deploy, Start, Stop, Kill, Status, Destroy, Exec, Attach, Runner, UpdatePorts, Snapshot.
EOF