import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const API_BASE = 'https://109.120.133.113/v1';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => Promise.reject(err)
);
