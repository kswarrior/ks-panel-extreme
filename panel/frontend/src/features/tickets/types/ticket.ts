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
  creator_email?: string;
  assigned_to?: number | null;
  assignee_name?: string;
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  due_at?: string | null;
  tags: string; // JSON array string
  comment_count: number;
  last_reply_at?: string | null;
  last_reply_by?: number | null;
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

export interface TicketDetail {
  ticket: Ticket;
  comments: TicketComment[];
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
}

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
