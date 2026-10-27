# Notifications

Backend: `notification_handler.go`, `notification_hub.go`. Repos: `notification_repo.go`,
`notification_pref_repo.go`. Models: `notification.go`. Migrations: 053.

## Concept
Announcements to every inbox. Every authenticated user can read/mutate own inbox; cross-user ops
(broadcast, send-to-user, admin list-all) require MANAGE_NOTIFICATIONS. Hub for real-time delivery.
Frontend: `features/notifications/`: Notifications, NotificationStats, NotificationBroadcast,
NotificationDetail, NotificationSchedules.
