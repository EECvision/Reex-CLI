// @internal — No changes needed

import { type TokenProvider } from "../types";
import { apiConfig } from "../../api.config";

let accessToken: string | null = null;
let customHeaders: Record<string, string> | null = null;

interface CookieTokenProvider extends TokenProvider {
  setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
  clearTokens: () => void;
    setCustomHeaders: (headers: Record<string, string>) => void;
  getCustomHeaders: () => Record<string, string>;
  removeCustomHeader: (key: string) => void;
}

/**
 * Hybrid Token Provider
 * - Access Token: Managed in memory (primary) & localStorage (fallback)
 * - Refresh Mechanism: Automatic via httpOnly cookies
 *
 * Edit `api.config.ts` to customize routes and storage keys.
 */

export const cookieTokenProvider: CookieTokenProvider = {
  getToken: () => {
    if (accessToken) return accessToken;
    if (typeof window !== "undefined") {
      return localStorage.getItem(apiConfig.auth.accessTokenKey);
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

  removeCustomHeader: (key) => {
    if (customHeaders) {
      delete customHeaders[key];
    }
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("custom_headers");
      if (stored) {
        try {
          const headers = JSON.parse(stored);
          delete headers[key];
          localStorage.setItem("custom_headers", JSON.stringify(headers));
        } catch {}
      }
    }
  },

  setTokens: ({ accessToken: newAccessToken }) => {
    accessToken = newAccessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem(apiConfig.auth.accessTokenKey, newAccessToken);
    }
  },

  clearTokens: () => {
    accessToken = null;
    customHeaders = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(apiConfig.auth.accessTokenKey);
      localStorage.removeItem("custom_headers");
    }
  },

  refreshToken: async () => {
    try {
      const response = await apiConfig.auth.refreshWithCookie();

      // Safely check if this is a raw Axios response wrapper
      const isRawAxiosResponse =
        response?.config && response?.headers && response?.status;

      const unwrappedData = isRawAxiosResponse ? response.data : response;
      const responseData = apiConfig.unwrapResponseData ? (unwrappedData?.data ?? unwrappedData) : unwrappedData;

      const extracted = apiConfig.auth.extractTokens(responseData);

      accessToken = extracted.accessToken;

      if (typeof window !== "undefined" && accessToken) {
        localStorage.setItem(apiConfig.auth.accessTokenKey, accessToken);
      }

      return accessToken;
    } catch {
      // Fallback: use stored access token if cookie refresh failed
      if (typeof window !== "undefined") {
        const storedAccessToken = localStorage.getItem(
          apiConfig.auth.accessTokenKey,
        );
        if (storedAccessToken) {
          accessToken = storedAccessToken;
          return accessToken;
        }
        localStorage.removeItem(apiConfig.auth.accessTokenKey);
      }

      accessToken = null;
      return null;
    }
  },
};
