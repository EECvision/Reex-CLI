// @internal — No changes needed
"use client";

import { SessionProvider } from "next-auth/react";
import { useEffect } from "react";

/**
 * Authentication guard wrapper for NextAuth.js
 */

export const NextAuthGuard = ({ children }: { children: React.ReactNode }) => {
  return (
    <SessionProvider>
      <NextAuthGuardInner>{children}</NextAuthGuardInner>
    </SessionProvider>
  );
};

const NextAuthGuardInner = ({ children }: { children: React.ReactNode }) => {
  // Listen for auth:logout events dispatched by core.ts when token refresh fails
  useEffect(() => {
    const handleLogout = () => {
      import("next-auth/react").then(({ signOut }) => signOut());
    };

    window.addEventListener("auth:logout", handleLogout);
    return () => window.removeEventListener("auth:logout", handleLogout);
  }, []);

  return <>{children}</>;
};
