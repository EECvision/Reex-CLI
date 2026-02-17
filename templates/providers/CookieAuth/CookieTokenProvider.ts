import axios from "axios";
import { TokenProvider, baseURL } from "../../config";

export const REFRESH_ENDPOINT = `${baseURL}/api/v1/auth/refresh`;
export const ACCESS_TOKEN_KEY = "access_token";

// In-memory storage for access token
let accessToken: string | null = null;

interface CookieTokenProvider extends TokenProvider {
    setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
    clearTokens: () => void;
}

// TokenProvider that stores tokens in memory and refreshes via API endpoint
export const cookieTokenProvider: CookieTokenProvider = {
    getToken: () => {
        if (accessToken) return accessToken;
        if (typeof window !== "undefined") {
            return localStorage.getItem(ACCESS_TOKEN_KEY);
        }
        return null;
    },

    setTokens: ({ accessToken: newAccessToken }) => {
        accessToken = newAccessToken;
        // Also persist to localStorage for hybrid support (fallback)
        if (typeof window !== "undefined") {
            localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
        }
    },

    clearTokens: () => {
        accessToken = null;
        if (typeof window !== "undefined") {
            localStorage.removeItem(ACCESS_TOKEN_KEY);
        }
    },

    refreshToken: async () => {
        try {
            // 1. Try to refresh via HttpOnly cookie
            const response = await axios.get(REFRESH_ENDPOINT);
            accessToken = response.data.accessToken;

            // Sync with localStorage
            if (typeof window !== "undefined" && accessToken) {
                localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
            }

            return accessToken;
        } catch {
            // 2. Fallback: Check if we have a valid access token in storage
            // This supports "access-token only" backends or when cookie is missing but token isn't explicit logout
            if (typeof window !== "undefined") {
                const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
                if (storedAccessToken) {
                    accessToken = storedAccessToken;
                    return accessToken;
                }

                // Clean up if no valid session found
                localStorage.removeItem(ACCESS_TOKEN_KEY);
            }

            accessToken = null;
            return null;
        }
    },
};
