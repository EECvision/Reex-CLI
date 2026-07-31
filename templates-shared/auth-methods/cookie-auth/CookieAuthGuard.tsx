// @internal — No changes needed
"use client";

import { useEffect, useState } from "react";
import { cookieTokenProvider } from "./provider";
import { apiClient } from "../../../api-services/core";

/**
 * Restores the user session on mount via the refresh endpoint.
 */

export const CookieAuthGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  // Configure API client synchronously on mount
  useState(() => {
    apiClient.defaults.withCredentials = true;
    return true;
  });

  useEffect(() => {
    // Attempt to restore access token from refresh cookie or localStorage
    const initAuth = async () => {
      try {
        await cookieTokenProvider.refreshToken?.();
      } catch (error) {
        console.warn("Auth initialization failed:", error);
      }
    };

    initAuth();
  }, []);

  return <>{children}</>;
};
