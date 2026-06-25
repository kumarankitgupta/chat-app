"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";

type Props = {
  suspendedUntil: string;
};

function formatRemaining(ms: number) {
  if (ms <= 0) {
    return "00m 00s";
  }

  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}m ${seconds
    .toString()
    .padStart(2, "0")}s`;
}

export default function ChatSuspendedNotice({ suspendedUntil }: Props) {
  const endTime = useMemo(
    () => new Date(suspendedUntil).getTime(),
    [suspendedUntil],
  );
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, endTime - Date.now()),
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showUnlockForm, setShowUnlockForm] = useState(false);
  const [tapCount, setTapCount] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, endTime - Date.now()));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [endTime]);

  useEffect(() => {
    if (showUnlockForm || tapCount === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTapCount(0);
    }, 1800);

    return () => window.clearTimeout(timer);
  }, [showUnlockForm, tapCount]);

  function handleNoticeTap() {
    if (showUnlockForm) {
      return;
    }

    setTapCount((current) => {
      const next = current + 1;
      if (next >= 5) {
        setShowUnlockForm(true);
        return 0;
      }
      return next;
    });
  }

  async function handleUnlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setIsUnlocking(true);
    setError("");

    try {
      const updatedBy = window.sessionStorage
        .getItem("private-chat-user")
        ?.toLowerCase();
      const response = await fetch("/api/emergency/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          updatedBy,
        }),
      });

      const payload = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(payload.message ?? "Wrong secret code.");
        return;
      }

      window.location.href = "/chat";
    } catch {
      setError("Could not disable emergency mode. Please try again.");
    } finally {
      setIsUnlocking(false);
    }
  }

  return (
    <main className="gate-screen">
      <section className="gate-panel" aria-labelledby="chat-suspended-title">
        <div className="gate-copy">
          <p className="eyebrow">Emergency Protection</p>
          <h1 id="chat-suspended-title">Services are suspended</h1>
          <p onClick={handleNoticeTap} role="button" tabIndex={0} onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleNoticeTap();
            }
          }}>
            Service are suspended for emergency protection. Time remaining:{" "}
            <strong>{formatRemaining(remaining)}</strong>
          </p>
        </div>
        {showUnlockForm ? (
          <form className="gate-form emergency-unlock-form" onSubmit={handleUnlockSubmit}>
            <label htmlFor="emergency-secret-code">Secret code</label>
            <input
              autoComplete="off"
              id="emergency-secret-code"
              inputMode="numeric"
              onChange={(event) => setCode(event.target.value)}
              placeholder="Enter emergency code"
              type="password"
              value={code}
            />
            {error ? <p className="form-error">{error}</p> : null}
            <button className="primary-button" disabled={isUnlocking} type="submit">
              {isUnlocking ? "Disabling..." : "Disable emergency"}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  );
}
