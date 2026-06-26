import { QueryClient } from '@tanstack/react-query';

export const queryClientInstance = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnWindowFocus: false,
			retry: 1,
			// Keep data fresh for 3 minutes — navigating back to a page reuses
			// the cached data instead of hitting Supabase again.
			staleTime: 3 * 60 * 1000,
			// Keep unused query data in memory for 5 minutes so fast tab-switching
			// never triggers a re-fetch.
			gcTime: 5 * 60 * 1000,
		},
	},
});