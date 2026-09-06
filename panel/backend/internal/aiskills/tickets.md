# Tickets skill

Tickets are user-opened support requests (general, billing, technical, feature, bug, abuse) triaged by staff with status (open, pending, in_progress, resolved, closed), priority (low, medium, high, urgent, critical), assignment and comments. Attachments, SLA tracking and notification preferences extend the base tables. Users work them from the Tickets pages with filters and a per-ticket chat composer.

## Visibility rules (enforced on every tool)

- Staff sees every ticket including internal notes; everyone else sees only their own or assigned tickets.
- Only staff can triage (status/assignee/escalated priority) or post internal notes. Owners may edit subject/description/category and low/medium priority on their own tickets.
- Closed tickets refuse new replies — reopen first.

## Playbooks

- Browse: `list_tickets` (optional status filter), then `get_ticket` for description plus comments.
- Open (for the caller): `create_ticket` with subject + details (+ category/priority, default general/medium).
- Reply: `reply_ticket` with the message; set internal=true for a staff-only note (staff only, hidden from the reporter). First staff reply stamps SLA first-response and notifies owner/assignee.
- Triage: `update_ticket` with status/priority/assigned_to (assignee by id or username; empty clears). Needs staff for those fields.

Every write needs AI Chat Writes plus its Tickets grant, and returns a confirmation ticket: summarise and ask for approval.
