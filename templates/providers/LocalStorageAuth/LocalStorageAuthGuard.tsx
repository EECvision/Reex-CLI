"use client";

import { useEffect, useState } from "react";
import { localStorageTokenProvider, ACCESS_TOKEN_KEY } from "./LocalStorageTokenProvider";

/**
 * Authentication initialization wrapper for localStorage-based token provider
 *
 * Purpose:
 * Restores user session on app mount by exchanging persisted refresh token
 * for a new access token. Essential for maintaining login state across
 * page refreshes when using localStorageTokenProvider.
 *
 * How it works:
 * 1. Checks if refresh token exists in localStorage
 * 2. If found, calls refresh endpoint to obtain new access token
 * 3. Stores access token in memory via localStorageTokenProvider
 * 4. Optionally sets custom headers if needed
 * 5. Renders children once initialization completes
 * 6. If no refresh token exists, skips refresh (user not logged in)
 *
 * Flow diagram:
 * Page Load → Check localStorage → Refresh Token Found?
 *   ├─ Yes → Call refreshToken() → Store in memory → Render app
 *   └─ No  → Skip refresh → Render app (unauthenticated)
 *
 * Usage:
 * Wrap your root layout or app component:
 *
 * @example
 * // app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <LocalStorageAuthGuard>
 *           {children}
 *         </LocalStorageAuthGuard>
 *       </body>
 *     </html>
 *   );
 * }
 *
 * @example
 * // Setting custom headers after login
 * // In your login component:
 * import { localStorageTokenProvider } from './LocalStorageTokenProvider';
 *
 * const handleLogin = async (credentials) => {
 *   const response = await loginApi(credentials);
 *
 *   // Store tokens
 *   localStorageTokenProvider.setTokens({
 *     accessToken: response.accessToken,
 *     refreshToken: response.refreshToken
 *   });
 *
 *   // Set custom headers required by your backend
 *   localStorageTokenProvider.setCustomHeaders({
 *     'x-session-key': response.sessionKey,
 *     'x-tenant-id': response.tenantId,
 *     'x-workspace-id': response.workspaceId
 *   });
 *
 *   router.push('/dashboard');
 * };
 *
 * Security considerations:
 * - Refresh token exposed in localStorage (vulnerable to XSS)
 * - Only use with proper CSP headers and XSS protection
 * - Consider cookieTokenProvider for production if backend supports httpOnly cookies
 *
 * Note: The refresh token key must match REFRESH_TOKEN_KEY in token-providers.ts
 * Update "refresh_token" below if you changed the constant
 */
export const LocalStorageAuthGuard = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        /**
         * Initialize authentication state on app mount
         * Restores session by exchanging refresh token for access token
         */
        const initAuth = async () => {
            // 1. Check for Refresh Token
            const hasRefreshToken = !!localStorage.getItem("refresh_token");

            // 2. Check for Access Token (in case backend is access-token only)
            const hasAccessToken = !!localStorage.getItem(ACCESS_TOKEN_KEY);

            if (hasRefreshToken && localStorageTokenProvider?.refreshToken) {
                try {
                    // Exchange refresh token for new access token
                    await localStorageTokenProvider.refreshToken();
                } catch (error) {
                    console.warn("Session restoration failed:", error);
                }
            } else if (hasAccessToken && localStorageTokenProvider?.refreshToken) {
                // If we only have an access token, allow the provider to "restore" it
                // (Our modified refreshToken method will pick it up from storage)
                await localStorageTokenProvider.refreshToken();
            }

            // Mark initialization complete regardless of outcome
            // Prevents infinite loading if refresh fails
            setIsReady(true);
        };

        initAuth();
    }, []);

    // Show loading state while restoring session
    // Replace with your app's loading component or skeleton
    if (!isReady) return <div>Loading...</div>;

    return <>{children}</>;
};
