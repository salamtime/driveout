import { QueryClient } from '@tanstack/react-query';

// Create a client for React Query with performance optimizations
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      cacheTime: 10 * 60 * 1000, // 10 minutes
      refetchOnWindowFocus: false,
      retry: 2,
      refetchOnMount: false
    }
  }
});