export default async function ChatPage() {
  return (
    <main className="gate-screen">
      <section className="gate-panel" aria-labelledby="chat-deactivated-title">
        <div className="gate-copy">
          <p className="eyebrow">Chat Status</p>
          <h1 id="chat-deactivated-title">Chat has been deactivated</h1>
          <p>
            The owner wants you to be protected. Chat will be enabled again in a
            few days.
          </p>
        </div>
      </section>
    </main>
  );
}
