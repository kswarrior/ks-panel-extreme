# KS Panel

**KS Panel** is a modern, open-source game server management panel designed for hosting providers and server administrators. It provides a clean web interface to deploy, manage, and monitor game servers across multiple nodes.

## Features

### Multi-Game Support
- Minecraft (Java & Bedrock)
- Valve games (CS2, TF2, Garry's Mod, etc.)
- Custom applications via templates
- Mod/plugin management with version control

### Node Architecture
- **Panel** — Central management UI and API
- **Edge** — Lightweight agent running on each host machine
- Horizontal scaling: add unlimited nodes
- Supports Docker, LXD, KVM, and Multipass drivers

### Instance Management
- One-click install, start, stop, restart, reinstall
- Console access with ANSI color support
- File manager with syntax highlighting
- Scheduled tasks (backups, restarts, commands)
- Environment variable / secret management
- Port allocation and firewall rules

### User & Access Control
- Role-based permissions (granular per-action keys)
- API keys for automation
- Two-factor authentication (TOTP)
- Audit logging for all actions

### Customization
- Theme system with live preview
- Custom pages per instance
- Branding (logo, colors, footer text)
- Template marketplace

## Quick Start

### Requirements
- Linux host (Ubuntu 22.04+, Debian 12+, or similar)
- Docker (for containerized game servers)
- Go 1.21+ (for building from source)
- Node.js 20+ (for frontend development)

### Installation

```bash
# Clone and build
git clone https://github.com/your-org/ks-panel.git
cd ks-panel
bash rebuild.sh

# Run panel
./release/kspanel

# Run edge on each node
./release/ksedge
```

### Docker (Recommended)
```bash
docker run -d \
  --name kspanel \
  -p 8080:8080 \
  -v kspanel-data:/data \
  ghcr.io/your-org/kspanel:latest
```

## Documentation

- [Getting Started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Node Setup](docs/node-setup.md)
- [Template Creation](docs/templates.md)
- [API Reference](docs/api.md)

## Community

- Discord: [Join us](https://discord.gg/your-invite)
- Issues: [GitHub Issues](https://github.com/your-org/ks-panel/issues)
- Discussions: [GitHub Discussions](https://github.com/your-org/ks-panel/discussions)

## License

MIT License — see [LICENSE](LICENSE) for details.

---

**Built for server admins, by server admins.**