// @internal — No changes needed
import { TokenProvider } from "../../config";
import { authConfig } from "../authConfig";

/**
 * LocalStorage Token Provider
 * - Access Token & Refresh Token: Persisted in localStorage
 *
 * Edit `authConfig.ts` to customize routes, storage keys, and refresh payload.
 */

let accessToken: string | null = null;
let customHeaders: Record<string, string> | null = null;

interface LocalStorageTokenProvider extends TokenProvider {
  setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
  clearTokens: () => void;
  setCustomHeaders: (headers: Record<string, string>) => void;
  getCustomHeaders: () => Record<string, string>;
}

export const localStorageTokenProvider: LocalStorageTokenProvider = {
  getToken: () => {
    if (accessToken) return accessToken;
    if (typeof window !== "undefined") {
      return localStorage.getItem(authConfig.accessTokenKey);
    }
    return null;
  },

  getCustomHeaders: () => {
    if (customHeaders) return customHeaders;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("custom_headers");
      if (stored) {
        try {
          return JSON.parse(stored);
        } catch {
          return {};
        }
      }
    }
    return {};
  },

  setCustomHeaders: (headers) => {
    customHeaders = headers;
    if (typeof window !== "undefined") {
      localStorage.setItem("custom_headers", JSON.stringify(headers));
    }
  },

  // Called on login/signup success
  setTokens: ({ accessToken: newAccessToken, refreshToken }) => {
    accessToken = newAccessToken;
    if (typeof window !== "undefined") {
      if (refreshToken) {
        localStorage.setItem(authConfig.refreshTokenKey, refreshToken);
        localStorage.removeItem(authConfig.accessTokenKey);
      } else {
        localStorage.setItem(authConfig.accessTokenKey, newAccessToken);
        localStorage.removeItem(authConfig.refreshTokenKey);
      }
    }
  },

  // Called on logout
  clearTokens: () => {
    accessToken = null;
    customHeaders = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(authConfig.refreshTokenKey);
      localStorage.removeItem(authConfig.accessTokenKey);
      localStorage.removeItem("custom_headers");
    }
  },

  // Exchange refresh token for a new access token
  refreshToken: async () => {
    try {
      if (typeof window === "undefined") return null;

      const storedRefreshToken = localStorage.getItem(
        authConfig.refreshTokenKey,
      );

      // Fallback: use stored access token if no refresh token
      if (!storedRefreshToken) {
        const storedAccessToken = localStorage.getItem(
          authConfig.accessTokenKey,
        );
        if (storedAccessToken) {
          accessToken = storedAccessToken;
          return accessToken;
        }
        throw new Error("No refresh token found");
      }

      const response = await authConfig.refreshWithToken(storedRefreshToken);

      // Safely check if this is a raw Axios response wrapper
      const isRawAxiosResponse =
        response?.config && response?.headers && response?.status;

      const unwrappedData = isRawAxiosResponse ? response.data : response;
      const responseData = unwrappedData?.data ?? unwrappedData;

      const { accessToken: newAccess, refreshToken: newRefresh } = responseData;
      accessToken = newAccess;

      if (newRefresh) {
        localStorage.setItem(authConfig.refreshTokenKey, newRefresh);
      }

      return accessToken;
    } catch {
      console.warn("Refresh failed, logging out...");
      accessToken = null;
      localStorage.removeItem(authConfig.refreshTokenKey);
      localStorage.removeItem(authConfig.accessTokenKey);
      return null;
    }
  },
};
