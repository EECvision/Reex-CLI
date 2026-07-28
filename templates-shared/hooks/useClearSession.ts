import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveProvider } from "../auth-methods/manager";

/**
 * Hook to clear the local session after a user logs out.
 * This removes stored tokens, clears the React Query cache, and dispatches a logout event.
 *
 * @example
 * const { clearSession } = useClearSession();
 * 
 * const handleLogout = async () => {
 *   await logoutApiCall(); // your backend logout logic
 *   clearSession();
 * };
 */
export const useClearSession = () => {
  const provider = getActiveProvider();
  const queryClient = useQueryClient();

  const clearSession = useCallback(async () => {
    provider?.clearTokens?.();

    // Clear React Query cache
    await queryClient.cancelQueries();
    queryClient.clear();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:logout"));
    }
  }, [provider, queryClient]);

  return { clearSession };
};
