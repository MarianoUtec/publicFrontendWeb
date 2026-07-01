import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || '';

// ─── Token helpers ────────────────────────────────────────────────────────────
export function getAccessToken(): string | null {
  return localStorage.getItem('mm_access');
}
export function getRefreshToken(): string | null {
  return localStorage.getItem('mm_refresh');
}
export function saveTokens(access: string, refresh: string) {
  localStorage.setItem('mm_access', access);
  localStorage.setItem('mm_refresh', refresh);
}
export function clearTokens() {
  localStorage.removeItem('mm_access');
  localStorage.removeItem('mm_refresh');
  localStorage.removeItem('mm_user');
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface User {
  id: number;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  isActive: boolean;
  spotifyId?: string | null;
  createdAt: string;
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  user: User;
}
export interface Song {
  id: number;
  title: string;
  artist: string;
  albumName?: string | null;
  coverUrl?: string | null;
  spotifyId?: string | null;
  previewUrl?: string | null;
  danceability?: number | null;
  energy?: number | null;
  valence?: number | null;
  musicbrainzId?: string | null;
}
export interface Rating {
  id: number;
  userId: number;
  song: Song;
  score: number;
  createdAt: string;
  updatedAt: string;
}
export interface Recommendation {
  id: number;
  userId: number;
  songs: Song[];
  basedOnUserId: number;
  basedOnUserName: string;
  createdAt: string;
}
export interface LatentProfile {
  userId: number;
  coordX: number;
  coordY: number;
  coordZ: number;
  closestUserId: number;
  compatibilityScore: number;
  updatedAt: string;
}
export interface LatentSpaceUser {
  userId: number;
  userName: string;
  x: number;
  y: number;
  z: number;
  compatibilityScore: number;
  closestUserId: number;
}
export interface LatentSpaceResponse {
  users: LatentSpaceUser[];
}
export interface LatentHistoryItem {
  id: number;
  coordX: number;
  coordY: number;
  coordZ: number;
  closestUserId: number;
  closestUserName: string;
  compatibilityScore: number;
  ratingsCount: number;
  recordedAt: string;
}
export interface FeedItem {
  userId: number;
  userName: string;
  compatibilityScore: number;
  song: Song;
  score: number;
  ratedAt: string;
}
export interface Conversation {
  id: number;
  otherUserId: number;
  otherUserName: string;
  messages: Message[];
  unreadCount: number;
  createdAt: string;
}
export interface Message {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  content: string;
  isRead: boolean;
  sentAt: string;
}
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  last: boolean;
}

// ─── Axios instance with interceptors ─────────────────────────────────────────
let isRefreshing = false;
let failedQueue: { resolve: (v: any) => void; reject: (e: any) => void }[] = [];

function processQueue(error: any, token: string | null = null) {
  failedQueue.forEach(p => (error ? p.reject(error) : p.resolve(token)));
  failedQueue = [];
}

export const client: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

client.interceptors.request.use(cfg => {
  const token = getAccessToken();
  if (token && cfg.headers) cfg.headers['Authorization'] = `Bearer ${token}`;
  return cfg;
});

client.interceptors.response.use(
  res => res,
  async err => {
    const original = err.config as AxiosRequestConfig & { _retry?: boolean };
    if (err.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          original.headers = { ...original.headers, Authorization: `Bearer ${token}` };
          return client(original);
        });
      }
      original._retry = true;
      isRefreshing = true;
      const refresh = getRefreshToken();
      if (refresh) {
        try {
          const res = await axios.post(
            `${BASE_URL}/api/v1/auth/refresh?refreshToken=${encodeURIComponent(refresh)}`
          );
          const { accessToken, refreshToken } = res.data;
          saveTokens(accessToken, refreshToken);
          processQueue(null, accessToken);
          original.headers = { ...original.headers, Authorization: `Bearer ${accessToken}` };
          return client(original);
        } catch (e) {
          processQueue(e, null);
          clearTokens();
          window.location.href = '/';
        } finally {
          isRefreshing = false;
        }
      } else {
        clearTokens();
        window.location.href = '/';
      }
    }
    return Promise.reject(err);
  }
);

// ─── Helper ───────────────────────────────────────────────────────────────────
function apiError(err: any): never {
  const msg =
    err.response?.data?.message ||
    err.response?.data ||
    err.message ||
    'Something went wrong';
  throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const auth = {
  login: async (email: string, password: string): Promise<AuthResponse> => {
    try {
      const { data } = await client.post<AuthResponse>('/api/v1/auth/login', { email, password });
      saveTokens(data.accessToken, data.refreshToken);
      return data;
    } catch (e) { apiError(e); }
  },
  register: async (name: string, email: string, password: string): Promise<AuthResponse> => {
    try {
      const { data } = await client.post<AuthResponse>('/api/v1/auth/register', { name, email, password });
      saveTokens(data.accessToken, data.refreshToken);
      return data;
    } catch (e) { apiError(e); }
  },
  logout: () => clearTokens(),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const users = {
  me: async (): Promise<User> => {
    try { const { data } = await client.get<User>('/api/v1/users/me'); return data; }
    catch (e) { apiError(e); }
  },
  updateMe: async (body: { name?: string }): Promise<User> => {
    try { const { data } = await client.put<User>('/api/v1/users/me', body); return data; }
    catch (e) { apiError(e); }
  },
  allAdmin: async (page = 0, size = 20): Promise<PageResponse<User>> => {
    try {
      const { data } = await client.get<PageResponse<User>>('/api/v1/admin/users', { params: { page, size } });
      return data;
    } catch (e) { apiError(e); }
  },
  // ─── Nueva función de compatibilidades ──────────────────────────────────────
  meCompatibilities: async (): Promise<{ compatibilities: Array<{ userId: number; userName: string; compatibilityScore: number }> }> => {
    try {
      const { data } = await client.get('/api/v1/users/me/compatibilities');
      return data;
    } catch (e) { apiError(e); }
  },
};

// ─── Songs ────────────────────────────────────────────────────────────────────
export const songs = {
  list: async (): Promise<Song[]> => {
    try { const { data } = await client.get<Song[]>('/api/v1/songs'); return data; }
    catch (e) { apiError(e); }
  },
  search: async (q: string): Promise<Song[]> => {
    try { const { data } = await client.get<Song[]>('/api/v1/songs/search', { params: { q } }); return data; }
    catch (e) { apiError(e); }
  },
  unrated: async (): Promise<Song[]> => {
    try { const { data } = await client.get<Song[]>('/api/v1/songs/unrated'); return data; }
    catch (e) { apiError(e); }
  },
};

// ─── Ratings ──────────────────────────────────────────────────────────────────
export const ratings = {
  rate: async (songId: number, score: number): Promise<Rating> => {
    try { const { data } = await client.post<Rating>('/api/v1/ratings', { songId, score }); return data; }
    catch (e) { apiError(e); }
  },
  mine: async (): Promise<Rating[]> => {
    try { const { data } = await client.get<Rating[]>('/api/v1/ratings/me'); return data; }
    catch (e) { apiError(e); }
  },
  delete: async (id: number): Promise<void> => {
    try { await client.delete(`/api/v1/ratings/${id}`); }
    catch (e) { apiError(e); }
  },
};

// ─── Recommendations ──────────────────────────────────────────────────────────
export const recommendations = {
  mine: async (): Promise<Recommendation> => {
    try { const { data } = await client.get<Recommendation>('/api/v1/recommendations/me'); return data; }
    catch (e) { apiError(e); }
  },
};

// ─── Latent Space ─────────────────────────────────────────────────────────────
export const latentSpace = {
  myProfile: async (): Promise<LatentProfile> => {
    try { const { data } = await client.get<LatentProfile>('/api/v1/users/me/latent-profile'); return data; }
    catch (e) { apiError(e); }
  },
  allUsers: async (): Promise<LatentSpaceResponse> => {
    try { const { data } = await client.get<LatentSpaceResponse>('/api/v1/users/latent-space'); return data; }
    catch (e) { apiError(e); }
  },
  history: async (): Promise<LatentHistoryItem[]> => {
    try { const { data } = await client.get<LatentHistoryItem[]>('/api/v1/users/me/twin-history'); return data; }
    catch (e) { apiError(e); }
  },
};

// ─── Feed ─────────────────────────────────────────────────────────────────────
export const feed = {
  get: async (): Promise<FeedItem[]> => {
    try { const { data } = await client.get<FeedItem[]>('/api/v1/feed'); return data; }
    catch (e) { apiError(e); }
  },
};

// ─── Chat ─────────────────────────────────────────────────────────────────────
export const chat = {
  conversations: async (): Promise<Conversation[]> => {
    try { const { data } = await client.get<Conversation[]>('/api/v1/conversations'); return data; }
    catch (e) { apiError(e); }
  },
  startConversation: async (userId: number): Promise<Conversation> => {
    try { const { data } = await client.post<Conversation>(`/api/v1/conversations/with/${userId}`); return data; }
    catch (e) { apiError(e); }
  },
  messages: async (convId: number): Promise<Message[]> => {
    try { const { data } = await client.get<Message[]>(`/api/v1/conversations/${convId}/messages`); return data; }
    catch (e) { apiError(e); }
  },
  sendMessage: async (convId: number, content: string): Promise<Message> => {
    try { const { data } = await client.post<Message>(`/api/v1/conversations/${convId}/messages`, { content }); return data; }
    catch (e) { apiError(e); }
  },
};