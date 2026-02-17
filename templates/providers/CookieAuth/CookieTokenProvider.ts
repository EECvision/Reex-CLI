import axios from "axios";
import { TokenProvider } from "../../config";

// In-memory storage for access token
let accessToken: string | null = null;

// TokenProvider that stores tokens in memory and refreshes via API endpoint
export const cookieTokenProvider: TokenProvider = {
    getToken: () => accessToken,

    refreshToken: async () => {
        try {
            const response = await axios.get("/api/v1/auth/refresh");
            accessToken = response.data.accessToken;
            return accessToken;
        } catch {
            accessToken = null;
            return null;
        }
    },
};
