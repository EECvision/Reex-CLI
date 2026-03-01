/* eslint-disable @typescript-eslint/no-explicit-any */
// @user-config — changes needed: Update access token and refresh token field names to match your API's response shape
import { useCallback } from "react";
import { usePostLoginMutation } from "../generated/useAuthenticationQueries";
import { apiClient } from "../config/clients";
import { authConfig } from "../config/authConfig";

/**
 * Login hook that stores tokens on success via the active provider.
 * Update the field names below to match your API's response shape.
 *
 * @example
 * const { login, setCustomHeaders, ...mutation } = useLogin();
 * login(credentials, { onSuccess: () => router.push("/dashboard") });
 */
export const useLogin = () => {
    const setCustomHeaders = useCallback((headers: Record<string, string>) => {
        const provider = getActiveProvider();
        provider?.setCustomHeaders?.(headers);
    }, []);

    const mutation = usePostLoginMutation({
        onSuccess: (data: any) => {
            const accessToken = data?.accessToken ?? data?.access_token ?? data?.token;
            const refreshToken = data?.refreshToken ?? data?.refresh_token;

            if (accessToken) {
                const provider = getActiveProvider();
                provider?.setTokens?.({ accessToken, refreshToken });
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
                    await apiClient.get(authConfig.logoutUrl);
                } catch {
                    console.warn("[useLogout] Server logout failed, clearing local tokens");
                }
            }
            provider?.clearTokens?.();
        } catch (error) {
            console.error("[useLogout] Logout failed:", error);
            provider?.clearTokens?.();
        }
    }, [callServer, provider]);

    return { logout };
};

// Resolve the active token provider from clients.ts
function getActiveProvider(): {
    setTokens?: (p: { accessToken: string; refreshToken?: string }) => void;
    clearTokens?: () => void;
    setCustomHeaders?: (headers: Record<string, string>) => void;
} | null {
    try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const clients = require("../config/clients");

        if (clients.activeTokenProvider) {
            return clients.activeTokenProvider;
        }
        return null;
    } catch {
        return null;
    }
}
