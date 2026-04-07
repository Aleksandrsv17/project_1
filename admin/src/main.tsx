import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './index.css';

// Handle demo mode BEFORE React renders — write to localStorage so Zustand hydrates with token
const params = new URLSearchParams(window.location.search);
if (params.get('demo') === '1') {
  const demoState = {
    state: {
      token: 'demo-mode',
      admin: { id: 'demo', email: 'admin@vipmobility.com', role: 'admin', first_name: 'Alex', last_name: 'Admin' },
    },
    version: 0,
  };
  localStorage.setItem('vip-admin-auth', JSON.stringify(demoState));
  // Clean URL and redirect without param
  window.history.replaceState({}, '', window.location.pathname);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
