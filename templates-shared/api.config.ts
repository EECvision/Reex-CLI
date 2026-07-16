// @user-config — changes needed: Update routes, keys, and endpoints to match your backend
import axios from "axios";

const BASE_URL = "https://example.com/api/v1";

export const apiConfig = {
  /**
   * 1. CORE SETTINGS
   * Update this to your actual backend URL or rely on environment variables
   */
  baseURL: BASE_URL,

  /** Set to true if your API wraps responses in a 'data' object */
  unwrapResponseData: false,

  /**
   * 2. AUTHENTICATION SETTINGS
   * Customize these to match your backend's authentication endpoints
   */
  auth: {
    loginUrl: "/auth/login",
    logoutUrl: "/auth/logout",
    logoutMethod: "POST" as "GET" | "POST",
    accessTokenKey: "access_token",
    refreshTokenKey: "refresh_token",
    refreshEndpoint: `${BASE_URL}/auth/refresh`,

    /** Refresh via httpOnly cookie. Edit the method/headers to match your backend. */
    refreshWithCookie: async () => {
      return await axios.post(apiConfig.auth.refreshEndpoint, undefined, {
        withCredentials: true,
      });
    },

    /** Refresh via stored token payload. Edit the property name to match your backend. */
    refreshWithToken: async (storedRefreshToken: string) => {
      return await axios.post(apiConfig.auth.refreshEndpoint, {
        refreshToken: storedRefreshToken,
      });
    },
  },
};
