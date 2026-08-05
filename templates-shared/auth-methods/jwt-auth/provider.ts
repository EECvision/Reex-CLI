// @internal — No changes needed
import { apiConfig } from "../../api.config";
import { type TokenProvider } from "../types";


/**
 * JWT Token Provider
 * - Access Token & Refresh Token: Persisted in localStorage
 *
 * Edit `api.config.ts` to customize routes and storage keys, and refresh payload.
 */

let accessToken: string | null = null;
let customHeaders: Record<string, string> | null = null;
let refreshPromise: Promise<string | null> | null = null;

/**
 * Decodes the JWT `exp` claim and checks whether it has passed.
 * No library needed — JWT payloads are plain base64url-encoded JSON.
 * Returns false for non-JWT strings so opaque tokens are never blocked.
 */
const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now();
  } catch {
    return false;
  }
};

interface JwtTokenProvider extends TokenProvider {
  setTokens: (tokens: { accessToken: string; refreshToken?: string }) => void;
  setSession: (
    tokens?: { accessToken?: string; refreshToken?: string },
    headers?: Record<string, string>,
  ) => void;
  clearTokens: () => void;
  setCustomHeaders: (headers: Record<string, string>) => void;
  getCustomHeaders: () => Record<string, string>;
  removeCustomHeader: (key: string) => void;
}

export const jwtTokenProvider: JwtTokenProvider = {
  getToken: () => {
    const token = accessToken ?? (
      typeof window !== "undefined"
        ? localStorage.getItem(apiConfig.auth.accessTokenKey)
        : null
    );

    if (token) {
      if (isTokenExpired(token)) {
        accessToken = null;
        if (typeof window !== "undefined") {
          localStorage.removeItem(apiConfig.auth.accessTokenKey);
          const hasRefreshToken = !!localStorage.getItem(apiConfig.auth.refreshTokenKey);
          if (!hasRefreshToken) {
            window.dispatchEvent(new Event("auth:logout"));
            return null;
          }
        }
      } else {
        return token;
      }
    }

    if (typeof window !== "undefined") {
      const storedRefreshToken = localStorage.getItem(apiConfig.auth.refreshTokenKey);
      if (storedRefreshToken && jwtTokenProvider.refreshToken) {
        return jwtTokenProvider.refreshToken();
      }
    }

    return null;
  },

  getCustomHeaders: () => {
    if (customHeaders) return customHeaders;
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("reex_custom_headers");
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
      localStorage.setItem("reex_custom_headers", JSON.stringify(headers));
    }
  },

  removeCustomHeader: (key) => {
    if (customHeaders) {
      delete customHeaders[key];
    }
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("reex_custom_headers");
      if (stored) {
        try {
          const headers = JSON.parse(stored);
          delete headers[key];
          localStorage.setItem("reex_custom_headers", JSON.stringify(headers));
        } catch {
          // ignore JSON parse / storage errors
        }
      }
    }
  },

  // Called on login/signup success with raw tokens
  setTokens: (tokens) => {
    const newAccessToken = tokens.accessToken;
    const refreshToken = tokens.refreshToken;
    accessToken = newAccessToken;
    if (typeof window !== "undefined") {
      if (refreshToken) {
        localStorage.setItem(apiConfig.auth.refreshTokenKey, refreshToken);
        localStorage.removeItem(apiConfig.auth.accessTokenKey);
      } else if (newAccessToken) {
        localStorage.setItem(apiConfig.auth.accessTokenKey, newAccessToken);
        localStorage.removeItem(apiConfig.auth.refreshTokenKey);
      }
      window.dispatchEvent(new Event("auth:login"));
    }
  },

  // Called on login with tokens and optional custom headers
  setSession: (tokens, headers) => {
    if (tokens?.accessToken) {
      jwtTokenProvider.setTokens(tokens as { accessToken: string; refreshToken?: string });
    }
    if (headers) {
      jwtTokenProvider.setCustomHeaders(headers);
    }
    if (typeof window !== "undefined" && !tokens?.accessToken) {
      window.dispatchEvent(new Event("auth:login"));
    }
  },

  // Called on logout
  clearTokens: () => {
    accessToken = null;
    customHeaders = null;
    refreshPromise = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(apiConfig.auth.refreshTokenKey);
      localStorage.removeItem(apiConfig.auth.accessTokenKey);
      localStorage.removeItem("reex_custom_headers");
    }
  },

  // Exchange refresh token for a new access token
  refreshToken: async () => {
    // If a refresh is already in progress, await the existing promise instead of making a new request
    if (refreshPromise) {
      return refreshPromise;
    }

    refreshPromise = (async () => {
      try {
        if (typeof window === "undefined") return null;

        const storedRefreshToken = localStorage.getItem(
          apiConfig.auth.refreshTokenKey,
        );

        // Fallback: use stored access token if no refresh token
        if (!storedRefreshToken) {
          const storedAccessToken = localStorage.getItem(
            apiConfig.auth.accessTokenKey,
          );
          if (storedAccessToken) {
            accessToken = storedAccessToken;
            return accessToken;
          }
          throw new Error("No refresh token found");
        }

        const response = await apiConfig.auth.refreshWithToken(storedRefreshToken);

        const isRawAxiosResponse =
          response?.config && response?.headers && response?.status;

        const unwrappedData = isRawAxiosResponse ? response.data : response;
        const responseData = apiConfig.unwrapResponseData ? (unwrappedData?.data ?? unwrappedData) : unwrappedData;

        const extracted = apiConfig.auth.extractTokens(responseData);

        const { accessToken: newAccess = null, refreshToken: newRefresh } = extracted;
        accessToken = newAccess;

        if (newRefresh) {
          localStorage.setItem(apiConfig.auth.refreshTokenKey, newRefresh);
        }

        if (newAccess && typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth:login"));
        }

        return accessToken;
      } catch {
        console.warn("Refresh failed, logging out...");
        accessToken = null;
        localStorage.removeItem(apiConfig.auth.refreshTokenKey);
        localStorage.removeItem(apiConfig.auth.accessTokenKey);
        return null;
      } finally {
        refreshPromise = null;
      }
    })();

    return refreshPromise;
  },
};
