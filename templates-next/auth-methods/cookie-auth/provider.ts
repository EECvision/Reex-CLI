// @internal — No changes needed
import { type TokenProvider } from "../types";
import { apiConfig } from "../../api.config";

let isCookieAuthActive: boolean = false;
let customHeaders: Record<string, string> | null = null;

// Used to track auth status across tabs, without exposing the actual token to JS
const COOKIE_FLAG_KEY = "reex_is_cookie_auth_active";

interface CookieTokenProvider extends TokenProvider {
  setTokens: (params: { accessToken?: string; refreshToken?: string }) => void;
  clearTokens: () => void;
  setCustomHeaders: (headers: Record<string, string>) => void;
  getCustomHeaders: () => Record<string, string>;
  removeCustomHeader: (key: string) => void;
}

/**
 * Cookie-Only Token Provider
 * - Access Token: Managed securely by the browser via HttpOnly cookies
 * - Refresh Mechanism: Automatic via HttpOnly cookies
 * - Frontend State: Maintained via a simple boolean flag
 */
export const cookieTokenProvider: CookieTokenProvider = {
  getToken: () => {
    // Return a proxy value so `useIsAuthenticated` knows we are logged in.
    // The actual token is sent automatically by the browser via cookies.
    if (isCookieAuthActive) return "cookie-active";
    if (typeof window !== "undefined") {
      return localStorage.getItem(COOKIE_FLAG_KEY) === "true" ? "cookie-active" : null;
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
        } catch {}
      }
    }
  },

  setTokens: () => {
    // The actual token is set by the backend via Set-Cookie headers.
    // We just set a primitive flag so the frontend knows the user is logged in.
    isCookieAuthActive = true;
    if (typeof window !== "undefined") {
      localStorage.setItem(COOKIE_FLAG_KEY, "true");
      window.dispatchEvent(new Event("auth:login"));
    }
  },

  clearTokens: () => {
    isCookieAuthActive = false;
    customHeaders = null;
    if (typeof window !== "undefined") {
      localStorage.removeItem(COOKIE_FLAG_KEY);
      localStorage.removeItem("reex_custom_headers");
    }
  },

  refreshToken: async () => {
    try {
      await apiConfig.auth.refreshWithCookie();

      // If the refresh succeeds, the browser now has the updated cookie.
      isCookieAuthActive = true;
      if (typeof window !== "undefined") {
        localStorage.setItem(COOKIE_FLAG_KEY, "true");
      }

      return "cookie-active";
    } catch {
      // Refresh failed, clear the session flag
      isCookieAuthActive = false;
      if (typeof window !== "undefined") {
        localStorage.removeItem(COOKIE_FLAG_KEY);
      }
      return null;
    }
  },
};
