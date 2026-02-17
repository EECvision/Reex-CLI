"use client";

import { useEffect, useState } from "react";
import { cookieTokenProvider } from "./CookieTokenProvider";

/**
 * Authentication initialization wrapper for cookie-based token provider
 *
 * Purpose:
 * Ensures access token is loaded into memory before rendering the app.
 * Since cookieTokenProvider stores access tokens in memory, they're lost
 * on page refresh. This component restores the token on app mount by
 * calling the refresh endpoint.
 *
 * How it works:
 * 1. Blocks rendering with loading state
 * 2. Calls refresh endpoint to get new access token from httpOnly cookie
 * 3. Stores token in memory via cookieTokenProvider
 * 4. Optionally sets custom headers if needed
 * 5. Renders children once token is restored (or refresh fails gracefully)
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
 *         <CookieAuthGuard>
 *           {children}
 *         </CookieAuthGuard>
 *       </body>
 *     </html>
 *   );
 * }
 *
 * @example
 * // Setting custom headers after initialization
 * // In your login component or wherever you receive session data:
 * import { cookieTokenProvider } from './CookieTokenProvider';
 *
 * const handleLogin = async (credentials) => {
 *   const response = await loginApi(credentials);
 *
 *   // Set custom headers required by your backend
 *   cookieTokenProvider.setCustomHeaders({
 *     'x-session-key': response.sessionKey,
 *     'x-tenant-id': response.tenantId,
 *     'x-workspace-id': response.workspaceId
 *   });
 *
 *   router.push('/dashboard');
 * };
 *
 * Note: Only needed for cookieTokenProvider. Not required for:
 * - nextAuthTokenProvider (NextAuth handles initialization)
 * - localStorageTokenProvider (if you implement token restoration separately)
 */
export const CookieAuthGuard = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        /**
         * Initialize authentication state on app mount
         * Attempts to restore access token from server-side refresh token cookie
         */
        const initAuth = async () => {
            try {
                // Call refresh endpoint to restore access token in memory
                await cookieTokenProvider.refreshToken?.();

                // OPTIONAL: Set custom headers if needed at initialization
                // Uncomment and modify based on your backend requirements:
                /*
                cookieTokenProvider.setCustomHeaders({
                  'x-session-key': 'value-from-somewhere',
                  'x-tenant-id': 'tenant-123'
                });
                */
            } catch (error) {
                // Gracefully handle initialization failure
                // User will be redirected to login on first authenticated API call
                console.warn("Auth initialization failed:", error);
            } finally {
                // Always set ready to prevent infinite loading state
                setIsReady(true);
            }
        };

        initAuth();
    }, []);

    // Show loading state while initializing authentication
    // Replace with your app's loading component or skeleton
    if (!isReady) {
        return <div>Loading...</div>;
    }

    return <>{children}</>;
};
