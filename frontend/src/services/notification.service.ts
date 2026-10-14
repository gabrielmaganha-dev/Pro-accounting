import { apiRequest } from '@/services/api';
import type { AppNotification, NotificationFilters, NotificationsPage } from '@/types/notification';

function buildQuery(filters: object): string {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text.length === 0) continue;
    params.set(key, text);
  }

  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function listNotifications(
  filters: NotificationFilters,
  signal?: AbortSignal,
): Promise<NotificationsPage> {
  return apiRequest<NotificationsPage>(
    `/notifications${buildQuery(filters)}`,
    signal ? { signal } : {},
  );
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  return apiRequest<AppNotification>(`/notifications/${id}/read`, { method: 'PATCH' });
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiRequest<{ updated: number }>('/notifications/read-all', { method: 'PATCH' });
}
