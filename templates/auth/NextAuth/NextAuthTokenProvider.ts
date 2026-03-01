// @internal — No changes needed
import { TokenProvider } from "../../config";
import { getSession } from "next-auth/react";

// Extend the Session type to include accessToken
declare module "next-auth" {
    interface Session {
        accessToken?: string;
    }
}
// TokenProvider for NextAuth.js - retrieves token from session
interface NextAuthTokenProvider extends TokenProvider {
    setTokens: (params: { accessToken: string; refreshToken?: string }) => void;
    clearTokens: () => void;
}

export const nextAuthTokenProvider: NextAuthTokenProvider = {
    getToken: async () => {
        const session = await getSession();
        return (session?.accessToken as string) || null;
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
        if (process.env.NODE_ENV === "development") {
            console.warn(
                "[NextAuthTokenProvider] clearTokens is a no-op. Use signOut() from next-auth/react instead.",
            );
        }
    },
};
