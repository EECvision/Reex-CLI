import { TokenProvider } from "../../config";
import { getSession } from "next-auth/react";

// Extend the Session type to include accessToken
declare module "next-auth" {
    interface Session {
        accessToken?: string;
    }
}
// TokenProvider for NextAuth.js - retrieves token from session
export const nextAuthTokenProvider: TokenProvider = {
    getToken: async () => {
        const session = await getSession();
        return (session?.accessToken as string) || null;
    },
    refreshToken: undefined,
};
