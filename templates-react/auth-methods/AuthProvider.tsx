// @internal — No changes needed

import React, { useState } from "react";
import { CookieAuthGuard } from "./cookie-auth/CookieAuthGuard";
import { JwtAuthGuard } from "./jwt-auth/JwtAuthGuard";
import { setActiveStrategy } from "./manager";
import { type AuthStrategy } from "./manager";

interface AuthProviderProps {
  strategy: AuthStrategy;
  children: React.ReactNode;
}

/**
 * Global AuthProvider that wraps the application and conditionally renders
 * the appropriate AuthGuard based on the configured strategy.
 * It also configures the global API client to use the correct TokenProvider.
 */
export const AuthProvider = ({ strategy, children }: AuthProviderProps) => {
  // Synchronously configure the API client's Strategy on the first render
  useState(() => {
    setActiveStrategy(strategy);
    return true;
  });

  switch (strategy) {
    case "cookie":
      return <CookieAuthGuard>{children}</CookieAuthGuard>;
    case "jwt":
      return <JwtAuthGuard>{children}</JwtAuthGuard>;
    default:
      console.warn(
        `Unknown auth strategy: ${strategy}. Falling back to jwt.`,
      );
      return <JwtAuthGuard>{children}</JwtAuthGuard>;
  }
};
