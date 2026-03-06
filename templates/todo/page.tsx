"use client";
import {
  useDeleteTodosMutation,
  useGetTodosQuery,
  usePostTodosMutation,
} from "@/api-services/generated";
import {
  useIsAuthenticated,
  useLogin,
  useLogout,
} from "@/api-services/hooks/useAuth";
import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {
  const [todo, setTodo] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const {
    login,
    setCustomHeaders,
    data: loginData,
    isPending: isLoginPending,
  } = useLogin();

  const { logout } = useLogout();

  const { isAuthenticated, isLoading } = useIsAuthenticated();

  const { data: todoData, isPending: isTodoPending } = useGetTodosQuery({
    enabled: isAuthenticated,
  });

  const postTodoMutation = usePostTodosMutation();
  const deleteTodoMutation = useDeleteTodosMutation();

  const handleLogin = () => {
    login(
      { username: "user", password: "user123" },
      {
        onSuccess: (res) => {
          if (!res) return;
          setCustomHeaders({ "x-token": "132412341234" });
        },
      },
    );
  };

  const createTodo = () => {
    postTodoMutation.mutate({ task: todo.trim() });
  };

  const deleteTodo = (id: string) => {
    setDeletingId(id);
    deleteTodoMutation.mutate(id, {
      onSettled: () => setDeletingId(null),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && todo.trim()) createTodo();
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        {!isAuthenticated ? (
          <div className={styles.loginView}>
            <div className={styles.lockIcon}>⌁</div>
            <h1 className={styles.title}>Todo</h1>
            <p className={styles.subtitle}>Sign in to manage your tasks</p>
            <button
              className={styles.primaryButton}
              onClick={handleLogin}
              disabled={isLoginPending}
            >
              {isLoginPending ? <span className={styles.spinner} /> : "Sign in"}
            </button>
          </div>
        ) : (
          <div className={styles.appView}>
            <header className={styles.header}>
              <h1 className={styles.title}>Tasks</h1>
              <button className={styles.logoutButton} onClick={logout}>
                Sign out
              </button>
            </header>

            <div className={styles.inputRow}>
              <input
                className={styles.input}
                type="text"
                placeholder="Add a new task…"
                value={todo}
                onChange={(e) => setTodo(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className={styles.addButton}
                disabled={!todo.trim() || postTodoMutation.isPending}
                onClick={createTodo}
              >
                {postTodoMutation.isPending ? (
                  <span className={styles.spinner} />
                ) : (
                  "+"
                )}
              </button>
            </div>

            <ul className={styles.todoList}>
              {isTodoPending ? (
                <li className={styles.emptyState}>
                  <span className={styles.spinner} />
                  <span>Loading tasks…</span>
                </li>
              ) : todoData && todoData.length > 0 ? (
                todoData.map((item) => (
                  <li key={item.id} className={styles.todoItem}>
                    <span className={styles.todoText}>{item.task}</span>
                    <button
                      className={styles.deleteButton}
                      onClick={() => deleteTodo(String(item.id))}
                      disabled={deletingId === String(item.id)}
                      aria-label="Delete task"
                    >
                      {deletingId === String(item.id) ? (
                        <span className={styles.deleteSpinner} />
                      ) : (
                        "x"
                      )}
                    </button>
                  </li>
                ))
              ) : (
                <li className={styles.emptyState}>No tasks yet</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
