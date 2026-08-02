"use client";

import React, { useState } from "react";
import { CookieAuthGuard } from "./cookie-auth/CookieAuthGuard";
import { NextAuthGuard } from "./next-auth/NextAuthGuard";
import { JwtAuthGuard } from "./jwt-auth/JwtAuthGuard";
import { setActiveStrategy, type AuthStrategy } from "./manager";

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
    case "next-auth":
      return <NextAuthGuard>{children}</NextAuthGuard>;
    case "jwt":
      return <JwtAuthGuard>{children}</JwtAuthGuard>;
    default:
      console.warn(`Unknown auth strategy: ${strategy}. Falling back to jwt.`);
      return <JwtAuthGuard>{children}</JwtAuthGuard>;
  }
};
