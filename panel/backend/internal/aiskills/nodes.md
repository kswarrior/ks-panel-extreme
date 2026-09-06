# Nodes skill

Nodes are edge machines running the ksedge agent. The panel registers each node (address + token), receives heartbeats with telemetry, and proxies lifecycle RPCs (deploy/start/stop/destroy), terminal, files and install workflows through it. A node lists which drivers (docker/lxd/kvm) it has available; deploys are refused when the driver is missing. Connection modes are direct, reverse_tunnel, local_port and local_wss, with TLS options and probe/rotate/purge operations on the NodeDetail page.

## Playbooks

- Inspect: `list_nodes` (id, name, address), then `get_node` for status, allowed kinds and connection mode. Tokens are never exposed — not in tools, not in chat.
- Register: `create_node` with name + dial address host:port (e.g. 10.0.0.5:8443). The edge token is returned ONCE — tell the user to save it into the edge config now; it can never be read back (only rotated from the NodeDetail page). Needs NODES_CREATE.
- Rename / re-address: `edit_node` with node_id plus the new name and/or address. Needs NODES_EDIT.
- Delete: `delete_node`. Refused while instances still live on the node — move or delete those first. Needs NODES_DELETE.

Never invent node IDs — look them up with list_nodes first. Every write needs AI Chat Writes plus its area permission, and returns a confirmation ticket: summarise and ask for approval.
