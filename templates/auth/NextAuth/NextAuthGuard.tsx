// @internal — No changes needed
"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { authConfig } from "../authConfig";
// import { nextAuthTokenProvider } from "./NextAuthTokenProvider";

/**
 * Authentication guard wrapper for NextAuth.js
 *
 * Protects routes by redirecting unauthenticated users to the path configured
 * in `authConfig.ts`. Wraps components that require authentication.
 */
export const NextAuthGuard = ({ children }: { children: React.ReactNode }) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect unauthenticated users using authConfig route
  useEffect(() => {
    if (status === "unauthenticated") {
      // Redirect using the path set in authConfig
      router.push(authConfig.loginUrl);
    }
  }, [status, router]);

  // Listen for auth:logout events dispatched by core.ts when token refresh fails
  useEffect(() => {
    const handleLogout = () => {
      // signOut() from next-auth will clear the session and redirect
      import("next-auth/react").then(({ signOut }) => signOut());
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  // Optional: Set custom headers from session data when authenticated
  useEffect(() => {
    if (status === "authenticated" && session) {
      // e.g. nextAuthTokenProvider.setCustomHeaders({ 'x-tenant-id': session.tenantId });
    }
  }, [status, session]);

  // Replace with your app's loading component
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
