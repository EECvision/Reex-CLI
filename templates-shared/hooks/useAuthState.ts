// @internal — No changes needed
import { useEffect, useState } from "react";
import { getActiveProvider } from "../auth-methods/manager";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

/**
 * Hook to check the current authentication state.
 * Returns the status ("loading", "authenticated", or "unauthenticated").
 *
 * @example
 * const { status } = useAuthState();
 * if (status === "loading") return <Loading />;
 * if (status === "unauthenticated") return <Login />;
 */
export const useAuthState = () => {
  const provider = getActiveProvider();

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
    const handleLogout = () => setStatus("unauthenticated");

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
  }, [provider]);

  return {
    status,
    isAuthenticated: status === "authenticated",
    isLoading: status === "loading",
  };
};
