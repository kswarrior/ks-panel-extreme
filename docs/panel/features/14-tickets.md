# Tickets

Backend: `ticket_handler.go`, `ticket_attachment_handler.go`, `ticket_sla_handler.go`.
Repos: `ticket_repo.go`, `ticket_attachment_repo.go`, `ticket_sla_repo.go`. Models: `ticket.go`.
Migrations: 052, 065. Permission: MANAGE_TICKETS umbrella + CRUD + scope.

## Concept
Support requests (general, billing, technical, feature, bug, abuse) triaged by staff. Comments,
attachments, SLA, notifications. User-opened; staff manage. Frontend: `features/tickets/`:
Tickets, TicketDetail, TicketForm, TicketStats, TicketSchedules, TicketChatPage.
