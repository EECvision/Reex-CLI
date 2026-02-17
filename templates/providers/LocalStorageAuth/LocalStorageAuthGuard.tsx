"use client";

import { useEffect, useState } from "react";
import { localStorageTokenProvider } from "./LocalStorageTokenProvider";

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
 *   localStorageTokenProvider.setTokens(
 *     response.accessToken,
 *     response.refreshToken
 *   );
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
            // Check if user has an existing session (refresh token in storage)
            // Update this key to match REFRESH_TOKEN_KEY in token-providers.ts
            const hasRefreshToken = !!localStorage.getItem("refresh_token");

            if (hasRefreshToken && localStorageTokenProvider?.refreshToken) {
                try {
                    // Exchange refresh token for new access token
                    // This populates the in-memory accessToken variable
                    await localStorageTokenProvider.refreshToken();

                    // OPTIONAL: Set custom headers if needed at initialization
                    // Uncomment and modify based on your backend requirements:
                    /*
                    localStorageTokenProvider.setCustomHeaders({
                      'x-session-key': 'value-from-somewhere',
                      'x-tenant-id': 'tenant-123'
                    });
                    */
                } catch (error) {
                    // Refresh failed - token likely expired or invalid
                    // clearTokens() already called by refreshToken() on failure
                    console.warn("Session restoration failed:", error);
                }
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
