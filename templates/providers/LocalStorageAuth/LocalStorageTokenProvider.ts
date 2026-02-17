import axios from "axios";
import { TokenProvider } from "../../config";

// Keys for LocalStorage
const REFRESH_TOKEN_KEY = "refresh_token";

// In-memory storage for access token
let accessToken: string | null = null;



// Define the interface for our specific provider (adds set/clear methods)
interface LocalStorageTokenProvider extends TokenProvider {
    setTokens: (accessToken: string, refreshToken: string) => void;
    clearTokens: () => void;
}

export const localStorageTokenProvider: LocalStorageTokenProvider = {
    // 1. Get the Access Token (used by API headers)
    getToken: () => accessToken,

    // 2. Login/Signup Component calls this on success
    setTokens: (newAccessToken: string, refreshToken: string) => {
        accessToken = newAccessToken;
        if (typeof window !== "undefined") {
            localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
        }
    },

    // 3. Logout Component calls this
    clearTokens: () => {
        accessToken = null;
        if (typeof window !== "undefined") {
            localStorage.removeItem(REFRESH_TOKEN_KEY);
        }
    },

    // 4. The Core Logic: Exchange Refresh Token for new Access Token
    refreshToken: async () => {
        try {
            if (typeof window === "undefined") return null;

            // A. Retrieve the refresh token from storage
            const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
            if (!storedRefreshToken) throw new Error("No refresh token found");

            // B. Send it to the backend in the BODY (Pattern B)
            // NOTE: Use a raw axios instance to avoid circular dependencies
            const response = await axios.post("/api/v1/auth/refresh", {
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
            return null;
        }
    },
};
