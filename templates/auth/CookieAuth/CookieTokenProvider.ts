// @internal — No changes needed
import { TokenProvider } from "../../config";
import { authConfig } from "../authConfig";

let accessToken: string | null = null;
let customHeaders: Record<string, string> | null = null;

interface CookieTokenProvider extends TokenProvider {
  setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
  clearTokens: () => void;
  setCustomHeaders: (headers: Record<string, string>) => void;
  getCustomHeaders: () => Record<string, string>;
}

/**
 * Hybrid Token Provider
 * - Access Token: Managed in memory (primary) & localStorage (fallback)
 * - Refresh Mechanism: Automatic via httpOnly cookies
 *
 * Edit `authConfig.ts` to customize routes and storage keys.
 */

export const cookieTokenProvider: CookieTokenProvider = {
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

  setTokens: ({ accessToken: newAccessToken }) => {
    accessToken = newAccessToken;
    if (typeof window !== "undefined") {
      localStorage.setItem(authConfig.accessTokenKey, newAccessToken);
    }
  },

  clearTokens: () => {
    accessToken = null;
    customHeaders = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(authConfig.accessTokenKey);
      localStorage.removeItem("custom_headers");
    }
  },

  refreshToken: async () => {
    try {
      const response = await authConfig.refreshWithCookie();

      // Safely check if this is a raw Axios response wrapper
      const isRawAxiosResponse =
        response?.config && response?.headers && response?.status;

      const unwrappedData = isRawAxiosResponse ? response.data : response;
      const responseData = unwrappedData?.data ?? unwrappedData;

      accessToken = responseData.accessToken;

      if (typeof window !== "undefined" && accessToken) {
        localStorage.setItem(authConfig.accessTokenKey, accessToken);
      }

      return accessToken;
    } catch {
      // Fallback: use stored access token if cookie refresh failed
      if (typeof window !== "undefined") {
        const storedAccessToken = localStorage.getItem(
          authConfig.accessTokenKey,
        );
        if (storedAccessToken) {
          accessToken = storedAccessToken;
          return accessToken;
        }
        localStorage.removeItem(authConfig.accessTokenKey);
      }

      accessToken = null;
      return null;
    }
  },
};
