// @internal — No changes needed
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveProvider } from "../auth-methods/manager";
import { apiConfig } from "../api.config";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Hook to manage authentication state, active sessions, and logout teardown.
 *
 * @example
 * const { status, isAuthenticated, setSession, clearSession } = useAuthSession();
 * if (status === "loading") return <Loading />;
 * if (!isAuthenticated) return <Login />;
 */
export const useAuthSession = () => {
  const provider = getActiveProvider();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await provider?.getToken?.();
        setStatus(token ? "authenticated" : "unauthenticated");
      } catch {
        setStatus("unauthenticated");
      }
    };

    checkAuth();

    // Listen to dispatch events to update UI instantly without refresh
    const handleLogin = () => setStatus("authenticated");
    const handleLogout = () => {
      provider?.clearTokens?.();
      queryClient.cancelQueries();
      queryClient.clear();
      setStatus("unauthenticated");

      if (typeof window !== "undefined") {
        const route = apiConfig.auth?.loginRoute || window.origin;
        window.location.href = route;
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("auth:login", handleLogin);
      window.addEventListener("auth:logout", handleLogout);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("auth:login", handleLogin);
        window.removeEventListener("auth:logout", handleLogout);
      }
    };
  }, [provider, queryClient]);

  const getToken = useCallback(
    () => provider?.getToken?.() ?? null,
    [provider],
  );

  const setSession = useCallback(
    (
      tokens?: { accessToken?: string; refreshToken?: string },
      headers?: Record<string, string>,
    ) => {
      if (provider?.setSession) {
        provider.setSession(tokens, headers);
      } else if (tokens?.accessToken && provider?.setTokens) {
        provider.setTokens(tokens as { accessToken: string; refreshToken?: string });
        if (headers && provider?.setCustomHeaders) {
          provider.setCustomHeaders(headers);
        }
      }
      setStatus("authenticated");
    },
    [provider],
  );

  const clearSession = useCallback(async () => {
    provider?.clearTokens?.();

    // Clear React Query cache
    await queryClient.cancelQueries();
    queryClient.clear();

    setStatus("unauthenticated");

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:logout"));
      const route = apiConfig.auth?.loginRoute || window.origin;
      window.location.href = route;
    }
  }, [provider, queryClient]);

  return {
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    getToken,
    setSession,
    clearSession,
  };
};
