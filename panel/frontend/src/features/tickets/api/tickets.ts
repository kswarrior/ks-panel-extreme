import client from '@/shared/api/client';
import type { Ticket, TicketComment, TicketDetail, TicketStats, CreateTicketPayload, UpdateTicketPayload, TicketAttachment, TicketSLAConfig } from '../types/ticket';

export async function listTickets(params?: {
  category?: string;
  priority?: string;
  status?: string;
  search?: string;
  mine?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ tickets: Ticket[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set('category', params.category);
  if (params?.priority) qs.set('priority', params.priority);
  if (params?.status) qs.set('status', params.status);
  if (params?.search) qs.set('search', params.search);
  if (params?.mine) qs.set('mine', '1');
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const suf = qs.toString() ? `?${qs.toString()}` : '';
  const res = await client.get<{ tickets: Ticket[]; total: number }>(`/api/tickets/${suf}`);
  return res.data;
}

export async function getTicket(id: number): Promise<TicketDetail> {
  const res = await client.get<TicketDetail>(`/api/tickets/${id}`);
  return res.data;
}

export async function createTicket(payload: CreateTicketPayload): Promise<Ticket> {
  const res = await client.post<Ticket>(`/api/tickets/`, payload);
  return res.data;
}

export async function updateTicket(id: number, payload: UpdateTicketPayload): Promise<Ticket> {
  const res = await client.put<Ticket>(`/api/tickets/${id}`, payload);
  return res.data;
}

export async function deleteTicket(id: number): Promise<void> {
  await client.delete(`/api/tickets/${id}`);
}

export async function assignTicket(id: number, assignedTo: number | null): Promise<Ticket> {
  const res = await client.post<Ticket>(`/api/tickets/${id}/assign`, { assigned_to: assignedTo });
  return res.data;
}

export async function ticketStats(): Promise<TicketStats> {
  const res = await client.get<TicketStats>(`/api/tickets/stats`);
  return res.data;
}

export async function listTicketComments(id: number): Promise<TicketComment[]> {
  const res = await client.get<TicketComment[]>(`/api/tickets/${id}/comments`);
  return res.data;
}

export async function addTicketComment(id: number, body: string, isInternal = false): Promise<TicketComment> {
  const res = await client.post<TicketComment>(`/api/tickets/${id}/comments`, { body, is_internal: isInternal });
  return res.data;
}

export async function deleteTicketComment(ticketId: number, commentId: number): Promise<void> {
  await client.delete(`/api/tickets/${ticketId}/comments/${commentId}`);
}

export async function listAssignableUsers(): Promise<{ ID: number; Username: string }[]> {
  const res = await client.get<{ ID: number; Username: string }[] | { id: number; username: string }[]>(`/api/tickets/users`);
  // normalize keys (Go struct uses ID/Username caps)
  const raw = res.data as any[];
  return raw.map((u: any) => ({
    ID: u.ID ?? u.id,
    Username: u.Username ?? u.username ?? u.name ?? `user#${u.ID ?? u.id}`,
  }));
}

export async function listTicketAttachments(ticketId: number): Promise<TicketAttachment[]> {
  const res = await client.get<TicketAttachment[]>(`/api/tickets/${ticketId}/attachments`);
  return res.data;
}

export async function uploadTicketAttachment(ticketId: number, file: File, commentId?: number): Promise<TicketAttachment> {
  const form = new FormData();
  form.append('file', file);
  if (commentId) form.append('comment_id', String(commentId));
  const res = await client.post<TicketAttachment>(`/api/tickets/${ticketId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
}

export function ticketAttachmentUrl(ticketId: number, attachmentId: number): string {
  return `/api/tickets/${ticketId}/attachments/${attachmentId}`;
}

export async function deleteTicketAttachment(ticketId: number, attachmentId: number): Promise<void> {
  await client.delete(`/api/tickets/${ticketId}/attachments/${attachmentId}`);
}

export async function getTicketSLAConfig(): Promise<TicketSLAConfig> {
  const res = await client.get<TicketSLAConfig>(`/api/tickets/sla-config`);
  return res.data;
}

export async function updateTicketSLAConfig(cfg: TicketSLAConfig): Promise<TicketSLAConfig> {
  const res = await client.put<TicketSLAConfig>(`/api/tickets/sla-config`, cfg);
  return res.data;
}
