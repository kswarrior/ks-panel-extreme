export type TicketCategory = 'general' | 'billing' | 'technical' | 'feature' | 'bug' | 'abuse' | 'other';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent' | 'critical';
export type TicketStatus = 'open' | 'pending' | 'in_progress' | 'resolved' | 'closed';

export interface Ticket {
  id: number;
  ticket_no: string;
  subject: string;
  description: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  created_by: number;
  creator_name?: string;
  creator_display_name?: string;
  creator_accent_color?: string;
  creator_avatar_symbol?: string;
  creator_has_avatar?: boolean;
  creator_email?: string;
  assigned_to?: number | null;
  assignee_name?: string;
  assignee_display_name?: string;
  assignee_accent_color?: string;
  assignee_avatar_symbol?: string;
  assignee_has_avatar?: boolean;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  due_at?: string | null;
  tags: string; // JSON array string
  comment_count: number;
  last_reply_at?: string | null;
  last_reply_by?: number | null;
  first_response_at?: string | null;
  sla_breached?: boolean;
  escalated?: boolean;
  escalated_at?: string | null;
}

export interface TicketComment {
  id: number;
  ticket_id: number;
  author_id: number;
  author_name?: string;
  author_display_name?: string;
  author_accent_color?: string;
  author_avatar_symbol?: string;
  author_has_avatar?: boolean;
  body: string;
  is_internal: boolean;
  created_at: string;
  updated_at: string;
}

export interface TicketAttachment {
  id: number;
  ticket_id: number;
  comment_id?: number | null;
  file_name: string;
  mime: string;
  size_bytes: number;
  sha256: string;
  uploaded_by: number;
  created_at: string;
}

export interface TicketSLA {
  ticket_id: number;
  first_response_at?: string | null;
  sla_breached: boolean;
  escalated: boolean;
  escalated_at?: string | null;
}

export interface TicketDetail {
  ticket: Ticket;
  comments: TicketComment[];
  attachments?: TicketAttachment[];
  sla?: TicketSLA | null;
}

export interface TicketStats {
  total: number;
  open: number;
  pending: number;
  in_progress: number;
  resolved: number;
  closed: number;
  unassigned: number;
  mine: number;
  breached: number;
  sla_pct: number;
}

export type TicketSLAConfig = Record<string, { first_response_mins: number; resolve_hours: number }>;

export interface TicketListResponse {
  tickets: Ticket[];
  total: number;
}

export interface CreateTicketPayload {
  subject: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  assigned_to?: number | null;
  due_at?: string | null;
  tags?: string[];
}

export interface UpdateTicketPayload {
  subject?: string;
  description?: string;
  category?: TicketCategory;
  priority?: TicketPriority;
  status?: TicketStatus;
  assigned_to?: number | null;
  due_at?: string | null;
  tags?: string[];
}
