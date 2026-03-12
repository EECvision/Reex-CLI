// @internal — No changes needed

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useCallback, useState, useEffect } from "react";
import { useMutation, type UseMutationOptions } from "@tanstack/react-query";
import { activeTokenProvider } from "../auth/manager";
import { apiClient } from "../config";
import { authConfig } from "../user-config/auth";

/**
 * Login hook that stores tokens on success via the active provider.
 * Update the field names below to match your API's response shape.
 *
 * @example
 * const { login, setCustomHeaders, ...mutation } = useLogin();
 * login(credentials, { onSuccess: () => router.push("/dashboard") });
 */
export const useLogin = (
  options?: Omit<UseMutationOptions<any, any, any, any>, "mutationFn">,
) => {
  const setCustomHeaders = useCallback((headers: Record<string, string>) => {
    const provider = getActiveProvider();
    provider?.setCustomHeaders?.(headers);
  }, []);

  const mutation = useMutation({
    mutationFn: async (credentials: any) => {
      const response = await apiClient.post(authConfig.loginUrl, credentials);

      // Safely check if this is a raw Axios response wrapper
      const isRawAxiosResponse =
        response?.config && response?.headers && response?.status;

      const unwrappedData = isRawAxiosResponse ? response.data : response;
      return unwrappedData?.data ?? unwrappedData;
    },
    ...options,
    onSuccess: (data: any, variables, context) => {
      const accessToken =
        data?.accessToken ?? data?.access_token ?? data?.token;
      const refreshToken = data?.refreshToken ?? data?.refresh_token ?? data?.refresh;

      const provider = getActiveProvider();
      provider?.setTokens?.({ accessToken, refreshToken });

      // Notify components to update auth state without a page refresh
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:login"));
      }

      if (options?.onSuccess) {
        (options.onSuccess as any)(data, variables, context);
      }
    },
  });

  return {
    login: mutation.mutate,
    loginAsync: mutation.mutateAsync,
    setCustomHeaders,
    ...mutation,
  };
};

/**
 * Logout hook that clears tokens and optionally calls the server logout endpoint.
 *
 * @example
 * const { logout } = useLogout();
 * <button onClick={logout}>Sign Out</button>
 */
export const useLogout = (options?: { callServer?: boolean }) => {
  const { callServer = true } = options ?? {};
  const provider = getActiveProvider();

  const logout = useCallback(async () => {
    try {
      if (callServer) {
        try {
          if (authConfig.logoutMethod === "POST") {
            await apiClient.post(authConfig.logoutUrl);
          } else {
            await apiClient.get(authConfig.logoutUrl);
          }
        } catch {
          console.warn(
            "[useLogout] Server logout failed, clearing local tokens",
          );
        }
      }
      provider?.clearTokens?.();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:logout"));
      }
    } catch (error) {
      console.error("[useLogout] Logout failed:", error);
      provider?.clearTokens?.();

      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth:logout"));
      }
    }
  }, [callServer, provider]);

  return { logout };
};

/**
 * Hook to check if the user is currently authenticated.
 * Returns true if an access token is present in the active provider.
 *
 * @example
 * const { isAuthenticated } = useIsAuthenticated();
 * if (!isAuthenticated) return <Login />;
 */
export const useIsAuthenticated = () => {
  const provider = getActiveProvider();

  // Initialize to false on server, check on mount
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await provider?.getToken?.();
        setIsAuthenticated(!!token);
      } catch {
        setIsAuthenticated(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();

    // Listen to dispatch events to update UI instantly without refresh
    const handleLogin = () => setIsAuthenticated(true);
    const handleLogout = () => setIsAuthenticated(false);

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

  return { isAuthenticated, isLoading };
};

// Resolve the active token provider from clients.ts
function getActiveProvider(): {
  getToken?: () => Promise<string | null> | string | null;
  setTokens?: (p: { accessToken: string; refreshToken?: string }) => void;
  clearTokens?: () => void;
  setCustomHeaders?: (headers: Record<string, string>) => void;
} | null {
  return activeTokenProvider ?? null;
}
