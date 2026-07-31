// @internal — No changes needed

import { useEffect, useState } from "react";
import { cookieTokenProvider } from "./provider";
import { apiClient } from "../../../api-services/core";
import LoadingScreen from "../../custom/loadingScreen/LoadingScreen";

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

  if (!isReady) {
    return <LoadingScreen />;
  }

  return <>{children}</>;
};
