// @internal — No changes needed
"use client";

import { useEffect } from "react";
import { localStorageTokenProvider } from "./provider";
import { apiConfig } from "../../api.config";

/**
 * Restores the user session on mount by exchanging the stored refresh token.
 */

export const LocalStorageAuthGuard = ({
  children,
}: {
  children: React.ReactNode;
}) => {

  useEffect(() => {
    // Attempt to restore session from stored tokens
    const initAuth = async () => {
      const hasRefreshToken = !!localStorage.getItem(
        apiConfig.auth.refreshTokenKey,
      );
      const hasAccessToken = !!localStorage.getItem(
        apiConfig.auth.accessTokenKey,
      );

      if ((hasRefreshToken || hasAccessToken) && localStorageTokenProvider?.refreshToken) {
        try {
          await localStorageTokenProvider.refreshToken();
        } catch (error) {
          console.warn("Session restoration failed:", error);
        }
      }
    };

    initAuth();
  }, []);

  return <>{children}</>;
};
