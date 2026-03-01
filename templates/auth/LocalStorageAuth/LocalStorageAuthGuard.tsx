// @internal — No changes needed
"use client";

import { useEffect, useState } from "react";
import { localStorageTokenProvider } from "./LocalStorageTokenProvider";
import { authConfig } from "@/api-services/config";

/**
 * Restores the user session on mount by exchanging the stored refresh token.
 * Wrap your root layout with `<LocalStorageAuthGuard>`. Configure in `authConfig.ts`.
 */

export const LocalStorageAuthGuard = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Attempt to restore session from stored tokens
        const initAuth = async () => {
            const hasRefreshToken = !!localStorage.getItem(authConfig.refreshTokenKey);
            const hasAccessToken = !!localStorage.getItem(authConfig.accessTokenKey);

            if (hasRefreshToken && localStorageTokenProvider?.refreshToken) {
                try {
                    await localStorageTokenProvider.refreshToken();
                } catch (error) {
                    console.warn("Session restoration failed:", error);
                }
            } else if (hasAccessToken && localStorageTokenProvider?.refreshToken) {
                // Access-token-only fallback: let the provider restore from storage
                await localStorageTokenProvider.refreshToken();
            }

            setIsReady(true);
        };

        initAuth();
    }, []);

    // Listen for auth:logout events dispatched by core.ts when token refresh fails
    useEffect(() => {
        const handleLogout = () => {
            localStorageTokenProvider.clearTokens();
            setIsReady(true); // Keep app rendered (in unauthenticated state)
        };

        window.addEventListener("auth:logout", handleLogout);
        return () => window.removeEventListener("auth:logout", handleLogout);
    }, []);

    // Replace with your app's loading component
    if (!isReady) return <div>Loading...</div>;

    return <>{children}</>;
};
