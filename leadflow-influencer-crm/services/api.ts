import axios from 'axios';
import { EmailSendRequest, SmtpConfig, EmailTemplate } from '../types';

const API_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8090').replace(/\/$/, '');
export const API_BASE_URL = API_URL;

export const toApiAssetUrl = (value?: string | null): string => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/')) return `${API_URL}${url}`;
  return url;
};

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to include the token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear token and redirect to login if unauthorized
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const authService = {
  login: async (username, password, otpCode?: string) => {
    const formData = new FormData();
    formData.append('username', username);
    formData.append('password', password);
    if (otpCode) formData.append('otp_code', otpCode);
    const response = await api.post('/token', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return response.data;
  },
  getMe: async () => {
    const response = await api.get('/users/me');
    return response.data;
  },
  register: async (username, password) => {
    const response = await api.post('/users/register', { username, password });
    return response.data;
  }
};

export const userService = {
  getSubAccounts: async () => {
    const response = await api.get('/users/sub-accounts');
    return response.data;
  },
  createSubAccount: async (username, password) => {
    const response = await api.post('/users/sub', { username, password });
    return response.data;
  },
  deleteSubAccount: async (id: number) => {
    const response = await api.delete(`/users/sub/${id}`);
    return response.data;
  },
  updateSubAccountPassword: async (id: number, password) => {
    const response = await api.put(`/users/sub/${id}/password`, { password });
    return response.data;
  },
  getAuditLogs: async (skip = 0, limit = 50) => {
    const response = await api.get('/users/audit-logs', { params: { skip, limit } });
    return response.data;
  },
  updateProfile: async (username: string) => {
    const response = await api.put('/users/me', { username });
    return response.data;
  },
  updatePassword: async (currentPassword: string, newPassword: string) => {
    const response = await api.put('/users/me/password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
    return response.data;
  },
  setup2FA: async () => {
    const response = await api.post('/users/me/2fa/setup');
    return response.data;
  },
  enable2FA: async (code: string) => {
    const response = await api.post('/users/me/2fa/enable', { code });
    return response.data;
  },
  disable2FA: async (currentPassword: string, code: string) => {
    const response = await api.post('/users/me/2fa/disable', {
      current_password: currentPassword,
      code,
    });
    return response.data;
  }
};

export const creatorService = {
  getAll: async (skip = 0, limit = 100, search?: string, hasEmail?: boolean, platform?: string, hasShareLink?: boolean, minFollowers?: number, maxFollowers?: number, location?: string) => {
    const params: any = { skip, limit };
    if (search) params.search = search;
    if (hasEmail !== undefined && hasEmail !== null) params.has_email = hasEmail;
    if (platform) params.platform = platform;
    if (location) params.location = location;
    if (hasShareLink !== undefined && hasShareLink !== null) params.has_sharelink = hasShareLink;
    if (minFollowers !== undefined && minFollowers !== null) params.min_followers = minFollowers;
    if (maxFollowers !== undefined && maxFollowers !== null) params.max_followers = maxFollowers;
    const response = await api.get('/creators/', { params });
    return response.data;
  },
  getById: async (id: string) => {
    const response = await api.get(`/creators/${id}`);
    return response.data;
  },
  importFromExcel: async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/creators/import', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  delete: async (id: string) => {
    const response = await api.delete(`/creators/${id}`);
    return response.data;
  },
  updateStatus: async (id: string, status: 'none' | 'pending') => {
    const response = await api.patch(`/creators/${id}/status`, { status });
    return response.data;
  },
  updateTags: async (id: string, tags: string[] | string, mode: 'merge' | 'replace' = 'merge') => {
    const response = await api.patch(`/creators/${id}/tags`, { tags, mode });
    return response.data;
  },
  batchUpdateTags: async (ids: string[] | number[], tags: string[] | string, mode: 'merge' | 'replace' = 'merge') => {
    const creatorIds = ids.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    const response = await api.post('/creators/tags/batch', {
      creator_ids: creatorIds,
      tags,
      mode,
    });
    return response.data;
  },
  batchDelete: async (ids: string[]) => {
    const promises = ids.map(id => api.delete(`/creators/${id}`));
    await Promise.all(promises);
  }
};

export const dashboardService = {
  getStats: async () => {
    const response = await api.get('/dashboard/stats');
    return response.data;
  }
};

export const smtpService = {
  getAll: async () => {
    const response = await api.get<SmtpConfig[]>('/emails/smtp');
    return response.data;
  },
  create: async (config: Partial<SmtpConfig>) => {
    const response = await api.post('/emails/smtp', config);
    return response.data;
  },
  update: async (id: number, config: Partial<SmtpConfig>) => {
    const response = await api.put(`/emails/smtp/${id}`, config);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await api.delete(`/emails/smtp/${id}`);
    return response.data;
  },
  test: async (config: Partial<SmtpConfig>) => {
    const response = await api.post('/emails/smtp/test', config);
    return response.data;
  }
};

export const emailService = {
  send: async (request: EmailSendRequest) => {
    const response = await api.post('/emails/send', request);
    return response.data;
  },
  getLogs: async (skip = 0, limit = 50, status?: string, replied?: boolean) => {
    const params: any = { skip, limit };
    if (status) params.status = status;
    if (replied !== undefined) params.replied = replied;
    const response = await api.get('/emails/logs', { params });
    return response.data;
  },
  getLogsStats: async () => {
    const response = await api.get('/emails/logs/stats');
    return response.data;
  },
  sync: async () => {
    const response = await api.post('/emails/sync');
    return response.data;
  }
};

export const templateService = {
  getAll: async () => {
    const response = await api.get('/templates');
    return response.data;
  },
  getById: async (id: number) => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },
  create: async (template: { title: string; subject: string; body: string }) => {
    const response = await api.post('/templates', template);
    return response.data;
  },
  update: async (id: number, template: Partial<{ title: string; subject: string; body: string }>) => {
    const response = await api.put(`/templates/${id}`, template);
    return response.data;
  },
  delete: async (id: number) => {
    const response = await api.delete(`/templates/${id}`);
    return response.data;
  }
};
