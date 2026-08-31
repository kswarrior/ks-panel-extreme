import client from '@/shared/api/client';
import type { Notification, NotificationStats, CreateNotificationPayload } from '../types/notification';

export async function listNotifications(params?: {
  category?: string;
  priority?: string;
  is_read?: boolean;
  q?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<Notification[]> {
  const sp = new URLSearchParams();
  if (params?.category) sp.set('category', params.category);
  if (params?.priority) sp.set('priority', params.priority);
  if (params?.is_read !== undefined) sp.set('is_read', params.is_read ? 'true' : 'false');
  if (params?.q) sp.set('q', params.q);
  if (params?.search) sp.set('search', params.search);
  if (params?.limit) sp.set('limit', String(params.limit));
  if (params?.offset) sp.set('offset', String(params.offset));
  const qs = sp.toString() ? `?${sp.toString()}` : '';
  const res = await client.get<Notification[]>(`/api/notifications${qs}`);
  return res.data;
}

export async function getNotification(id: number): Promise<Notification> {
  const res = await client.get<Notification>(`/api/notifications/${id}`);
  return res.data;
}

export async function getUnreadCount(): Promise<number> {
  const res = await client.get<{ unread: number }>(`/api/notifications/unread-count`);
  return res.data.unread;
}

export async function getNotificationStats(): Promise<NotificationStats> {
  const res = await client.get<NotificationStats>(`/api/notifications/stats`);
  return res.data;
}

export async function markRead(id: number): Promise<void> {
  await client.put(`/api/notifications/${id}/read`);
}

export async function markAllRead(): Promise<{ marked: number }> {
  const res = await client.put<{ marked: number; status: string }>(`/api/notifications/read-all`);
  return res.data;
}

export async function deleteNotification(id: number): Promise<void> {
  await client.delete(`/api/notifications/${id}`);
}

export async function clearNotifications(onlyRead = false): Promise<{ deleted: number }> {
  const qs = onlyRead ? '?only_read=true' : '';
  const res = await client.delete<{ deleted: number }>(`/api/notifications${qs}`);
  return res.data;
}

export async function createNotification(payload: CreateNotificationPayload): Promise<{ id?: number; ids?: number[]; count?: number }> {
  const res = await client.post(`/api/notifications`, payload);
  return res.data;
}
