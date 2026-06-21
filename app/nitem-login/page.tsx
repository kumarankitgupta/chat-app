"use client";

import { FormEvent, useState } from "react";

export default function NitemLoginPage() {
  const [name, setName] = useState("");
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const normalizedName = name.trim().toLowerCase();
    const normalizedId = studentId.trim();

    const isAllowedUser = normalizedName === "bubu" || normalizedName === "buggu";
    if (!isAllowedUser || !normalizedId) {
      setError("Wrong credential");
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
          name: normalizedName,
          studentId: normalizedId,
          password: normalizedId,
        }),
      });

      if (!response.ok) {
        setError("Wrong credential");
        return;
      }

      window.sessionStorage.setItem("private-chat-user", normalizedName);
      window.location.href = "/chat";
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="nitem-screen">
      <section className="nitem-shell">
        <header className="nitem-header">
          <img
            alt="NIFTEM Kundli logo"
            className="nitem-logo-image"
            src="/niftem-logo.png"
          />
          <div className="nitem-logo-copy">
            <h1>NIFTEM KUNDLI</h1>
            <p>National Institute of Food Technology Entrepreneurship and Management</p>
          </div>
          <p className="nitem-subline">
            An Institute of National Importance, Kundli, Sonipat, Haryana
          </p>
        </header>

        <section className="nitem-welcome-card">
          <h2>Welcome to NIFTEM Kundli</h2>
          <p>
            You can ask your query here. Enter your name and student ID to raise
            a query.
          </p>
        </section>

        <section className="nitem-contact-list" aria-label="Student welfare contacts">
          <article className="nitem-contact-card">
            <div className="nitem-avatar" aria-hidden="true">
              PN
            </div>
            <div className="nitem-contact-copy">
              <h3>Dr. P.K. Nema</h3>
              <p>Dean (Student Welfare)</p>
              <p>Contact: +91-130-2281049</p>
              <p>Ext. No.: 1049</p>
              <p>Email: pknema@niftem.ac.in</p>
            </div>
          </article>

          <article className="nitem-contact-card">
            <div className="nitem-avatar" aria-hidden="true">
              VK
            </div>
            <div className="nitem-contact-copy">
              <h3>Dr. Vijay Kumar</h3>
              <p>Associate Dean (Student Welfare)</p>
              <p>Contact: +91-130-2281250</p>
              <p>Ext. No.: 1250</p>
              <p>Email: vijay.kumar@niftem.ac.in</p>
            </div>
          </article>
        </section>

        <form className="nitem-form-card" onSubmit={handleSubmit}>
          <label htmlFor="nitem-name">Name</label>
          <input
            id="nitem-name"
            autoComplete="name"
            onChange={(event) => setName(event.target.value)}
            placeholder="Enter your name"
            required
            value={name}
          />

          <label htmlFor="nitem-id">Student ID</label>
          <input
            id="nitem-id"
            autoComplete="off"
            onChange={(event) => setStudentId(event.target.value)}
            placeholder="Enter student ID"
            required
            value={studentId}
          />

          {error ? <p className="nitem-error">{error}</p> : null}

          <button className="nitem-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Checking..." : "Raise Query"}
          </button>
        </form>
      </section>
    </main>
  );
}
