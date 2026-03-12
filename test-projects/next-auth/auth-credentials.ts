import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { authConfig } from './auth.config';
import { baseURL } from './api-services/user-config/constants';

// Extend NextAuth types to include accessToken
declare module "next-auth" {
  interface User {
    accessToken?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text", placeholder: "admin" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const res = await fetch(`${baseURL}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              username: credentials?.username,
              password: credentials?.password,
            }),
          });

          if (!res.ok) return null;

          const raw = await res.json();
          // API wraps payload in a `data` property (same unwrap as useAuth.ts)
          const data = raw?.data ?? raw;
          // Return user + accessToken so the JWT callback can capture it
          return {
            id: data.id ?? "1",
            name: data.username ?? (credentials?.username as string),
            email: data.email ?? undefined,
            accessToken: data.access_token ?? data.accessToken ?? data.token,
          };
        } catch {
          return null;
        }
      }
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // On initial sign-in, persist the accessToken into the JWT
      if (user?.accessToken) {
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      // Expose accessToken on the client-side session
      (session as any).accessToken = token.accessToken;
      return session;
    },
  },
});

