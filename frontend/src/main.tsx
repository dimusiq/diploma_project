import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import {
  RouterProvider,
  createRouter,
} from '@tanstack/react-router';
import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { routeTree } from './routeTree.gen';

import { ApiError, OpenAPI } from './client';
import { CustomProvider } from './components/ui/provider';

// Типы для переменных окружения Vite
type ViteEnv = {
  env?: {
    VITE_API_URL?: string;
    DEV?: boolean;
    MODE?: string;
  };
};

// Проверка и установка базового URL API
const apiUrl = (import.meta as ViteEnv).env?.VITE_API_URL;
if (!apiUrl) {
  console.error(
    'VITE_API_URL is not defined. Please set it in your .env file.'
  );
}
OpenAPI.BASE = apiUrl || 'http://localhost:8000';

// Настройка токена для API запросов
OpenAPI.TOKEN = async () => {
  return localStorage.getItem('access_token') || '';
};

// Создание роутера перед обработчиком ошибок
const router = createRouter({ routeTree });
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

// Обработчик ошибок API
const handleApiError = (error: Error) => {
  // Логирование ошибок в dev режиме
  if ((import.meta as ViteEnv).env?.DEV) {
    console.error('API Error:', error);
  }

  if (
    error instanceof ApiError &&
    [401, 403].includes(error.status)
  ) {
    localStorage.removeItem('access_token');
    // Используем роутер для навигации вместо window.location
    router.navigate({ to: '/login' });
  }
};

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleApiError,
  }),
  mutationCache: new MutationCache({
    onError: handleApiError,
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found. Make sure there is a <div id="root"></div> in your HTML.');
}

ReactDOM.createRoot(rootElement).render(
  <StrictMode>
    <CustomProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {((import.meta as ViteEnv).env?.DEV ?? (import.meta as ViteEnv).env?.MODE === 'development') && (
          <ReactQueryDevtools initialIsOpen={false} />
        )}
      </QueryClientProvider>
    </CustomProvider>
  </StrictMode>
);
