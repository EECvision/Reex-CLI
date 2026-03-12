"use client";

import { useState } from "react";
import styles from "./page.module.css";
import { signIn, signOut, useSession } from "next-auth/react";
import { useGetTodosQuery } from "@/api-services/generated";

export default function Home() {
  const { data: session, status } = useSession();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data } = useGetTodosQuery({ enabled: status === "authenticated" });

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    const username = formData.get("username") as string;
    const password = formData.get("password") as string;

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid username or password.");
      }
    } catch (err) {
      console.error("Login failed", err);
      setError("An unexpected error occurred.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsLoggingOut(true);
    try {
      await signOut({ redirect: false });
    } catch (err) {
      console.error("Logout failed", err);
    } finally {
      setIsLoggingOut(false);
    }
  };


  return (
    <div className={styles.page}>
      <main className={styles.main}>
        {session ? (
          <div className={styles.intro}>
            <h1>Welcome back, {session.user?.name}!</h1>
            <p>You are successfully authenticated via API Services & NextAuth.</p>
            <br />
            {
              data?.map((todo) => (
                <div key={todo.id}>
                  <p>{todo.task}</p>
                </div>
              ))
            }
            <br />
            <form onSubmit={handleLogout}>
              <button className={styles.secondary} type="submit" disabled={isLoggingOut}>
                {isLoggingOut ? "Signing Out..." : "Sign Out"}
              </button>
            </form>
          </div>
        ) : (
          <div className={styles.intro}>
            <h1>Demonstration Login</h1>
            <p>Log in to test authentication via API Services.</p>
            <p><strong>Username:</strong> admin <br /> <strong>Password:</strong> password</p>
            <br />
            <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem", maxWidth: "300px", margin: "0 auto" }}>
              <input
                type="text"
                name="username"
                placeholder="Username"
                defaultValue="admin"
                required
                style={{ padding: "0.5rem", borderRadius: "5px", border: "1px solid #ccc", color: "black" }}
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                defaultValue="password"
                required
                style={{ padding: "0.5rem", borderRadius: "5px", border: "1px solid #ccc", color: "black" }}
              />
              <button className={styles.primary} type="submit" disabled={isLoggingIn}>
                {isLoggingIn ? "Logging In..." : "Log In"}
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
