// @internal — No changes needed
import { TokenProvider } from "../../config";
import { getSession } from "next-auth/react";

// Extend the Session type to include accessToken
declare module "next-auth" {
    interface Session {
        accessToken?: string;
    }
}
let customHeaders: Record<string, string> | null = null;

// TokenProvider for NextAuth.js - retrieves token from session
interface NextAuthTokenProvider extends TokenProvider {
    setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
    clearTokens: () => void;
    setCustomHeaders: (headers: Record<string, string>) => void;
    getCustomHeaders: () => Record<string, string>;
}

export const nextAuthTokenProvider: NextAuthTokenProvider = {
    getToken: async () => {
        const session = await getSession();
        return (session?.accessToken as string) || null;
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

    refreshToken: undefined,

    // Placeholder methods for compatibility with other providers
    // NextAuth manages these internally via session
    setTokens: () => {
        if (process.env.NODE_ENV === "development") {
            console.warn(
                "[NextAuthTokenProvider] setTokens is a no-op. NextAuth manages tokens via session.",
            );
        }
    },
    clearTokens: () => {
        customHeaders = null;
        if (typeof window !== "undefined") {
            localStorage.removeItem("custom_headers");
        }
        if (process.env.NODE_ENV === "development") {
            console.warn(
                "[NextAuthTokenProvider] clearTokens token part is a no-op. Use signOut() from next-auth/react instead.",
            );
        }
    },
};
