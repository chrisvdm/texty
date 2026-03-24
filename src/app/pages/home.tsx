const EXAMPLES = [
  {
    title: "Minimal Executor",
    href: "/sandbox/demo-executor",
    summary:
      "Start here if you want to see the smallest useful setup. familiar receives a message, chooses a tool, and calls real code.",
  },
  {
    title: "Async Countdown",
    href: "/sandbox/async-countdown",
    summary:
      "See how delayed work fits into the conversation. The executor answers quickly, then sends the final result back later.",
  },
  {
    title: "Pinned Tool",
    href: "/sandbox/pinned-tool",
    summary:
      "See explicit tool calls in action. A user pins a tool, keeps talking, and familiar keeps routing that text to the same place.",
  },
];

export const Home = () => (
  <main className="landing-page">
    <section className="landing-shell">
      <header className="landing-hero">
        <p className="landing-eyebrow">familiar</p>
        <h1 className="landing-title">
          A conversation layer for tools, workflows, and useful code.
        </h1>
        <p className="landing-copy">
          familiar sits between a person and an executor. It keeps the thread,
          asks follow-up questions when something is missing, chooses the right
          tool, and passes clean input to the system that does the work.
        </p>
        <p className="landing-copy landing-copy-soft">
          The goal is simple: make executable systems easier for junior
          developers, product teams, and AI-built tools to understand and use.
        </p>
      </header>

      <section className="landing-section">
        <div className="landing-section-copy">
          <p className="landing-section-label">What to open</p>
          <h2 className="landing-section-title">Three examples. One product idea.</h2>
          <p className="landing-section-body">
            Each example shows a different part of the same flow. Pick the one
            that matches the question you have right now.
          </p>
        </div>

        <div className="landing-grid">
          {EXAMPLES.map((example) => (
            <a key={example.href} className="landing-card" href={example.href}>
              <h3 className="landing-card-title">{example.title}</h3>
              <p className="landing-card-copy">{example.summary}</p>
              <span className="landing-card-link">Open example</span>
            </a>
          ))}
        </div>
      </section>
    </section>
  </main>
);
