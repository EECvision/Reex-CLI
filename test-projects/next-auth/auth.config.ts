import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/api/auth/signin', // You can customize this later or let NextAuth use the default
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnProtectedRoute = nextUrl.pathname.startsWith('/protected'); // Adjust this as needed
      
      if (isOnProtectedRoute) {
        if (isLoggedIn) return true;
        return false; // Redirect unauthenticated users to login page
      } else if (isLoggedIn) {
        // Example: Redirect logged-in users away from auth pages if needed
        // return Response.redirect(new URL('/dashboard', nextUrl));
      }
      return true;
    },
  },
  providers: [], // Add providers with an empty array for now
} satisfies NextAuthConfig;
