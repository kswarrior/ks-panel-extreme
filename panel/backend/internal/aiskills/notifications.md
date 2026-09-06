# Notifications skill

Every user owns their inbox (list, mark-read, delete — always allowed); cross-user operations need MANAGE_NOTIFICATIONS. Broadcasts fan out to every account with realtime push plus email per each user's preferences, and land in activity_logs.

## Playbook

- Announce: `broadcast_notification` with title + message. State the recipient count from the proposal, keep announcements short, and never broadcast secrets or credentials. Needs NOTIFICATIONS_CREATE plus AI Chat Writes, and returns a confirmation ticket: summarise and ask for approval.
