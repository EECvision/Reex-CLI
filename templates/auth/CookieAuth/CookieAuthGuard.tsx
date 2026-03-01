// @internal — No changes needed
"use client";

import { useEffect, useState } from "react";
import { cookieTokenProvider } from "./CookieTokenProvider";

/**
 * Restores the user session on mount via the refresh endpoint.
 * Wrap your root layout with `<CookieAuthGuard>`. Configure in `authConfig.ts`.
 */

export const CookieAuthGuard = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Attempt to restore access token from refresh cookie or localStorage
        const initAuth = async () => {
            try {
                await cookieTokenProvider.refreshToken?.();
            } catch (error) {
                console.warn("Auth initialization failed:", error);
            } finally {
                setIsReady(true);
            }
        };

        initAuth();
    }, []);

    // Listen for auth:logout events dispatched by core.ts when token refresh fails
    useEffect(() => {
        const handleLogout = () => {
            cookieTokenProvider.clearTokens();
            setIsReady(true); // Keep app rendered (in unauthenticated state)
        };

        window.addEventListener("auth:logout", handleLogout);
        return () => window.removeEventListener("auth:logout", handleLogout);
    }, []);

    // Replace with your app's loading component
    if (!isReady) {
        return <div>Loading...</div>;
    }

    return <>{children}</>;
};
