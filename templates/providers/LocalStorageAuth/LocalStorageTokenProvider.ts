import axios from "axios";
import { TokenProvider, baseURL } from "../../config";

// Keys for LocalStorage
export const REFRESH_TOKEN_KEY = "refresh_token";
export const ACCESS_TOKEN_KEY = "access_token";

export const REFRESH_ENDPOINT = `${baseURL}/api/v1/auth/refresh`;

// In-memory storage for access token
let accessToken: string | null = null;


// Define the interface for our specific provider (adds set/clear methods)
interface LocalStorageTokenProvider extends TokenProvider {
    setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
    clearTokens: () => void;
}

export const localStorageTokenProvider: LocalStorageTokenProvider = {
    // 1. Get the Access Token (used by API headers)
    getToken: () => {
        if (accessToken) return accessToken;
        if (typeof window !== "undefined") {
            return localStorage.getItem(ACCESS_TOKEN_KEY);
        }
        return null;
    },

    // 2. Login/Signup Component calls this on success
    setTokens: ({ accessToken: newAccessToken, refreshToken }) => {
        accessToken = newAccessToken;
        if (typeof window !== "undefined") {
            if (refreshToken) {
                localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
                // If we have a refresh token, we don't strictly need to persist access token,
                // but for consistency/fallback we can, or just rely on memory + refresh.
                // CURRENT LOGIC: Prefer refresh token flow.
                localStorage.removeItem(ACCESS_TOKEN_KEY);
            } else {
                // If NO refresh token, persist access token to survive reloads
                localStorage.setItem(ACCESS_TOKEN_KEY, newAccessToken);
                localStorage.removeItem(REFRESH_TOKEN_KEY);
            }
        }
    },

    // 3. Logout Component calls this
    clearTokens: () => {
        accessToken = null;
        if (typeof window !== "undefined") {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
        }
    },

    // 4. The Core Logic: Exchange Refresh Token for new Access Token
    refreshToken: async () => {
        try {
            if (typeof window === "undefined") return null;

            // A. Retrieve the refresh token from storage
            const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

            // If NO refresh token, check if we have a persisted access token
            if (!storedRefreshToken) {
                const storedAccessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
                if (storedAccessToken) {
                    // We treat the stored access token as valid for now.
                    // If it's actually expired, the next API call will fail with 401,
                    // and since we have no refresh token, the user will be logged out by the interceptor.
                    accessToken = storedAccessToken;
                    return accessToken;
                }
                throw new Error("No refresh token found");
            }

            // B. Send it to the backend in the BODY (Pattern B)
            // NOTE: Use a raw axios instance to avoid circular dependencies
            const response = await axios.post(REFRESH_ENDPOINT, {
                refresh_token: storedRefreshToken, // Match your API's expected field name
            });

            // C. Update our state with the NEW tokens
            const { accessToken: newAccess, refreshToken: newRefresh } =
                response.data;

            accessToken = newAccess;

            // Optional: If backend rotates refresh tokens, update it too
            if (newRefresh) {
                localStorage.setItem(REFRESH_TOKEN_KEY, newRefresh);
            }

            return accessToken;
        } catch {
            // If refresh fails (token expired/invalid), log them out completely
            console.warn("Refresh failed, logging out...");
            accessToken = null;
            localStorage.removeItem(REFRESH_TOKEN_KEY);
            localStorage.removeItem(ACCESS_TOKEN_KEY);
            return null;
        }
    },
};
