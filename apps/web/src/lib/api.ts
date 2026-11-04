import axios from 'axios';
import { selectedBlockchainNetwork } from './blockchain-network';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api',
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    config.headers['X-PrivateAssetz-Network'] = selectedBlockchainNetwork().id;
    const token = localStorage.getItem('privateassetz-auth')
      ? (JSON.parse(localStorage.getItem('privateassetz-auth') as string)?.state?.token as string | undefined)
      : undefined;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
