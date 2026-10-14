import { apiRequest } from '@/services/api';
import type {
  AppearancePayload,
  CompanyPayload,
  GeneralPayload,
  ProfilePayload,
  Settings,
  SettingsResponse,
} from '@/types/settings';
import type { AuthUser } from '@/types/auth';

export async function getSettings(signal?: AbortSignal): Promise<SettingsResponse> {
  return apiRequest<SettingsResponse>('/settings', signal ? { signal } : {});
}

export async function updateCompany(payload: CompanyPayload): Promise<Settings> {
  return apiRequest<Settings>('/settings/company', { method: 'PUT', body: payload });
}

export async function updateAppearance(payload: AppearancePayload): Promise<Settings> {
  return apiRequest<Settings>('/settings/appearance', { method: 'PUT', body: payload });
}

export async function updateGeneral(payload: GeneralPayload): Promise<Settings> {
  return apiRequest<Settings>('/settings/general', { method: 'PUT', body: payload });
}

export async function updateOwnProfile(payload: ProfilePayload): Promise<AuthUser> {
  return apiRequest<AuthUser>('/users/me', { method: 'PUT', body: payload });
}
