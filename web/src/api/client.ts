import axios from 'axios';
import { useAuthStore } from '../store/authStore';

export const api = axios.create({ baseURL: 'https://109.120.133.113/v1' });

api.interceptors.request.use(cfg => {
  const token = useAuthStore.getState().token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

// Token refresh state — prevents multiple concurrent refresh calls
let isRefreshing = false;
let pendingQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

const processPending = (error: any, token: string | null = null) => {
  pendingQueue.forEach(p => error ? p.reject(error) : p.resolve(token!));
  pendingQueue = [];
};

api.interceptors.response.use(
  r => r,
  async err => {
    const original = err.config;

    // Only attempt refresh on 401, not on the refresh endpoint itself, and not on retries
    if (err.response?.status !== 401 || original._retry || original.url?.includes('/auth/refresh')) {
      return Promise.reject(err);
    }

    const { refreshToken, setTokens, logout } = useAuthStore.getState();
    if (!refreshToken) {
      logout();
      return Promise.reject(err);
    }

    if (isRefreshing) {
      // Queue this request until refresh completes
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then(token => {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    try {
      const { data } = await axios.post(
        'https://109.120.133.113/v1/auth/refresh',
        { refresh_token: refreshToken }
      );
      const newAccess = data.data.tokens?.access_token ?? data.data.access_token;
      const newRefresh = data.data.tokens?.refresh_token ?? data.data.refresh_token;

      setTokens(newAccess, newRefresh);
      api.defaults.headers.common.Authorization = `Bearer ${newAccess}`;
      original.headers.Authorization = `Bearer ${newAccess}`;

      processPending(null, newAccess);
      return api(original);
    } catch (refreshErr) {
      processPending(refreshErr);
      logout();
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  }
);
