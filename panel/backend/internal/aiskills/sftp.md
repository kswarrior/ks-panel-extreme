# SFTP skill

SFTP gives per-instance file access through a chrooted SSH server on the edge node (port 2222), provisioned automatically on deploy. Credentials are per-instance bcrypt passwords with 5-failures/15-minute lockout, managed from the instance SFTP card. Paths are jailed to the instance filesystem so users can never escape to the host. The panel API exposes get-or-provision and credential rotation endpoints gated by instance file permissions.

Assistant coverage is read-only here: there are no SFTP tools, so answer from this guide and point at the instance SFTP card. Never reveal passwords or credentials.
