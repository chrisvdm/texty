"use client";

import type { GlobalMemory, ThreadMemory } from "../chat/shared";
import styles from "./debug.module.css";

type DebugClientProps = {
  activeMessageCount: number;
  activeThreadId: string;
  globalMemory: GlobalMemory;
  threadCount: number;
  threadMemory: ThreadMemory;
};

export const DebugClient = ({
  activeMessageCount,
  activeThreadId,
  globalMemory,
  threadCount,
  threadMemory,
}: DebugClientProps) => {
  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <span className={styles.wordmark}>texty</span>
        <a href="/" className={styles.backLink}>
          Back to chat
        </a>
      </header>

      <section className={styles.layout}>
        <article className={styles.hero}>
          <p className={styles.eyebrow}>Debug Route</p>
          <h1 className={styles.title}>Memory Inspector</h1>
          <p className={styles.intro}>
            This route shows the persisted browser-session memory and the active
            thread memory directly from server state so extraction, promotion,
            and retrieval can be inspected without relying on model responses.
          </p>
          <div className={styles.heroMeta}>
            <div className={styles.heroBadge}>Personal facts</div>
            <div className={styles.heroBadge}>Memory tree</div>
            <div className={styles.heroBadge}>Thread memory</div>
          </div>
        </article>

        <section className={styles.panel}>
          <p className={styles.panelEyebrow}>Overview</p>
          <h2 className={styles.panelTitle}>Session Overview</h2>
          <div className={styles.metaList}>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>Active Thread</span>
              {activeThreadId}
            </p>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>Thread Count</span>
              {threadCount}
            </p>
            <p className={styles.metaRow}>
              <span className={styles.metaLabel}>Active Messages</span>
              {activeMessageCount}
            </p>
          </div>
        </section>

        <section className={styles.panel}>
          <p className={styles.panelEyebrow}>Global Memory</p>
          <h2 className={styles.panelTitle}>Personal Facts</h2>
          {globalMemory.facts.length > 0 ? (
            <pre className={styles.code}>
              {JSON.stringify(globalMemory.facts, null, 2)}
            </pre>
          ) : (
            <p className={styles.empty}>No personal facts stored.</p>
          )}
        </section>

        <section className={styles.panel}>
          <p className={styles.panelEyebrow}>Global Memory</p>
          <h2 className={styles.panelTitle}>Memory Tree</h2>
          {globalMemory.threadSummaries.length > 0 ? (
            <pre className={styles.code}>
              {JSON.stringify(globalMemory.threadSummaries, null, 2)}
            </pre>
          ) : (
            <p className={styles.empty}>No thread summaries indexed.</p>
          )}
        </section>

        <section className={styles.panel}>
          <p className={styles.panelEyebrow}>Thread Memory</p>
          <h2 className={styles.panelTitle}>Current Thread Summary</h2>
          <p className={styles.metaRow}>
            <span className={styles.metaLabel}>Summary</span>
            {threadMemory.summary || "No thread summary stored."}
          </p>
          <p className={styles.metaRow}>
            <span className={styles.metaLabel}>Keywords</span>
            {threadMemory.keywords.length > 0
              ? threadMemory.keywords.join(", ")
              : "No keywords stored."}
          </p>
        </section>

        <section className={styles.panel}>
          <p className={styles.panelEyebrow}>Thread Memory</p>
          <h2 className={styles.panelTitle}>Current Thread Facts</h2>
          {threadMemory.facts.length > 0 ? (
            <pre className={styles.code}>
              {JSON.stringify(threadMemory.facts, null, 2)}
            </pre>
          ) : (
            <p className={styles.empty}>No current-thread facts stored.</p>
          )}
        </section>
      </section>
    </main>
  );
};
