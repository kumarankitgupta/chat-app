"use client";

import { FormEvent, useState } from "react";
import { LockKeyhole, Loader2, UserRound } from "lucide-react";

const CHAT_USERS = ["bubu", "buggu"] as const;

type ChatUser = (typeof CHAT_USERS)[number];

export default function AuthForm() {
  const [password, setPassword] = useState("");
  const [selectedUser, setSelectedUser] = useState<ChatUser | "">("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!selectedUser) {
      setError("Choose bubu or buggu before entering.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: selectedUser,
          studentId: password,
          password,
        }),
      });

      if (!response.ok) {
        const result = (await response.json()) as { message?: string };
        setError(result.message ?? "Could not unlock the chat.");
        return;
      }

      window.sessionStorage.setItem("private-chat-user", selectedUser);
      window.location.href = "/chat";
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="gate-screen">
      <section className="gate-panel" aria-labelledby="gate-title">
        <div className="gate-badge" aria-hidden="true">
          <LockKeyhole size={22} strokeWidth={2.2} />
        </div>
        <div className="gate-copy">
          <p className="eyebrow">Private Space</p>
          <h1 id="gate-title">Open the room</h1>
        </div>

        <form className="gate-form" onSubmit={handleSubmit}>
          <fieldset className="user-choice">
            <legend>Who is entering?</legend>
            <div className="choice-grid">
              {CHAT_USERS.map((user) => (
                <button
                  aria-pressed={selectedUser === user}
                  className={`choice-button ${
                    selectedUser === user ? "is-selected" : ""
                  }`}
                  key={user}
                  onClick={() => setSelectedUser(user)}
                  type="button"
                >
                  <UserRound size={18} aria-hidden="true" />
                  {user}
                </button>
              ))}
            </div>
          </fieldset>

          <label htmlFor="password">Password</label>
          <input
            id="password"
            autoComplete="current-password"
            autoFocus
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
          />
          {error ? <p className="form-error">{error}</p> : null}
          <button className="primary-button" disabled={isSubmitting} type="submit">
            {isSubmitting ? (
              <Loader2 className="spin" size={18} aria-hidden="true" />
            ) : (
              <LockKeyhole size={18} aria-hidden="true" />
            )}
            Unlock
          </button>
        </form>
      </section>
    </main>
  );
}
