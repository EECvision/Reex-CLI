// @user-config — changes needed: Update routes, keys, and endpoints to match your backend
import axios from "axios";
import { baseURL } from "../config/constants";

/**
 * Centralized Authentication Configuration
 *
 * Customize these values and functions to match your backend's
 * authentication requirements.
 */
export const authConfig = {
  /** Redirect path for unauthenticated users */
  loginUrl: "/auth/login",

  /** Server-side logout endpoint */
  logoutUrl: "/auth/logout",

  /** HTTP Method for logout endpoint (e.g., "GET", "POST") */
  logoutMethod: "POST" as "GET" | "POST",

  /** localStorage key for access token */
  accessTokenKey: "access_token",

  /** localStorage key for refresh token (if applicable) */
  refreshTokenKey: "refresh_token",

  /** Refresh token endpoint */
  refreshEndpoint: `${baseURL}/auth/refresh`,

  /** Refresh via httpOnly cookie. Edit the method/headers to match your backend. */
  refreshWithCookie: async () => {
    return await axios.get(authConfig.refreshEndpoint);
  },

  /** Refresh via stored token payload. Edit the property name to match your backend. */
  refreshWithToken: async (storedRefreshToken: string) => {
    return await axios.post(authConfig.refreshEndpoint, {
      refreshToken: storedRefreshToken,
    });
  },
};
