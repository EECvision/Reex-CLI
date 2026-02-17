"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
// import { nextAuthTokenProvider } from "./NextAuthTokenProvider";

/**
 * Authentication guard wrapper for NextAuth.js
 *
 * Purpose:
 * Protects routes by redirecting unauthenticated users to login page.
 * Wraps components that require authentication when using nextAuthTokenProvider.
 *
 * How it works:
 * 1. Monitors NextAuth session status (loading/authenticated/unauthenticated)
 * 2. Shows loading state while session is being validated
 * 3. Redirects to login if user is unauthenticated
 * 4. Optionally sets custom headers from session data
 * 5. Renders children only when user is authenticated
 *
 * Session states:
 * - "loading": Initial session check in progress
 * - "authenticated": Valid session exists, user is logged in
 * - "unauthenticated": No valid session, redirect to login
 *
 * Usage:
 * Wrap protected pages or layouts:
 *
 * @example
 * // app/dashboard/layout.tsx
 * export default function DashboardLayout({ children }) {
 *   return (
 *     <NextAuthGuard>
 *       {children}
 *     </NextAuthGuard>
 *   );
 * }
 *
 * @example
 * // app/profile/page.tsx
 * export default function ProfilePage() {
 *   return (
 *     <NextAuthGuard>
 *       <UserProfile />
 *     </NextAuthGuard>
 *   );
 * }
 *
 * @example
 * // Setting custom headers from NextAuth session
 * // First, extend your NextAuth session type to include custom fields:
 * // lib/auth.ts or next-auth.d.ts
 * declare module "next-auth" {
 *   interface Session {
 *     accessToken?: string;
 *     sessionKey?: string;
 *     tenantId?: string;
 *   }
 * }
 *
 * // Then this component will automatically set headers when session is available
 * // Or you can manually set headers in your signin callback:
 * // [...nextauth]/route.ts
 * callbacks: {
 *   async signIn({ user, account }) {
 *     // After successful sign in
 *     nextAuthTokenProvider.setCustomHeaders({
 *       'x-session-key': user.sessionKey,
 *       'x-tenant-id': user.tenantId
 *     });
 *     return true;
 *   }
 * }
 *
 * Configuration:
 * - Update "/auth/login" to match your login route
 * - Customize loading UI to match your app's loading component or skeleton
 *
 * Note: This component handles route protection only.
 * Token management is handled automatically by nextAuthTokenProvider
 * through NextAuth's jwt() and session() callbacks.
 */
export const NextAuthGuard = ({
    children,
}: {
    children: React.ReactNode;
}) => {
    const { data: session, status } = useSession();
    const router = useRouter();

    /**
     * Redirect unauthenticated users to login page
     * Runs whenever session status changes
     */
    useEffect(() => {
        if (status === "unauthenticated") {
            // Update this path to match your login route
            router.push("/auth/login");
        }
    }, [status, router]);

    /**
     * Set custom headers from session data when authenticated
     */
    useEffect(() => {
        if (status === "authenticated" && session) {
            // OPTIONAL: Set custom headers from session
            // Uncomment and modify based on your session structure:
            /*
            nextAuthTokenProvider.setCustomHeaders({
              'x-session-key': session.sessionKey,
              'x-tenant-id': session.tenantId,
              'x-workspace-id': session.workspaceId
            });
            */
        }
    }, [status, session]);

    // Show loading state during initial session validation
    // Replace with your app's loading component or skeleton
    if (status === "loading") {
        return <div>Loading...</div>;
    }

    // Render protected content only when authenticated
    if (status === "authenticated") {
        return <>{children}</>;
    }

    // Return null during redirect to prevent flash of protected content
    return null;
};
