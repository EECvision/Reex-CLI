// @internal — No changes needed
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getActiveProvider } from "../auth-methods/manager";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Hook to check authentication state and clear local sessions.
 *
 * @example
 * const { status, isAuthenticated, clearSession } = useAuthState();
 * if (status === "loading") return <Loading />;
 * if (!isAuthenticated) return <Login />;
 */
export const useAuthState = () => {
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

  const clearSession = useCallback(async () => {
    provider?.clearTokens?.();

    // Clear React Query cache
    await queryClient.cancelQueries();
    queryClient.clear();

    setStatus("unauthenticated");

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("auth:logout"));
    }
  }, [provider, queryClient]);

  return {
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
    clearSession,
  };
};

