"use client";

import { useState } from "react";

import styles from "./setup.module.css";

type CreateAccountResponse = {
  account: {
    id: string;
    created_at: string;
  };
  setup: {
    id: string;
  };
  token: {
    value: string;
    prefix: string;
    last_four: string;
    created_at: string;
  };
};

const curlExample = (token: string) =>
  `curl -X POST https://familiar.chrsvdmrw.dev/api/v1/tools/sync \\
  -H "Authorization: Bearer ${token}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "tools": []
  }'`;

export const SetupClient = () => {
  const [result, setResult] = useState<CreateAccountResponse | null>(null);
  const [status, setStatus] = useState("");
  const [isPending, setIsPending] = useState(false);

  const handleCreateAccount = async () => {
    setIsPending(true);
    setStatus("");

    try {
      const response = await fetch("/api/v1/accounts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
        }),
      });
      const payload = (await response.json()) as
        | CreateAccountResponse
        | { error?: { message?: string } };

      if (!response.ok || !("account" in payload) || !("token" in payload)) {
        const errorMessage =
          "error" in payload ? payload.error?.message : undefined;
        throw new Error(errorMessage || "Unable to create account.");
      }

      setResult(payload);
      setStatus("Account created. Copy the token now. It is only shown once.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to create account.");
      setResult(null);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className={styles.shell}>
      <div className={styles.topbar}>
        <a className={styles.toplink} href="/">
          Home
        </a>
        <a className={styles.toplink} href="/docs/quickstart">
          Quickstart
        </a>
      </div>

      <header className={styles.hero}>
        <p className={styles.eyebrow}>Hosted Onboarding</p>
        <h1 className={styles.title}>Create an account. Get an API token.</h1>
        <p className={styles.copy}>
          This is the shortest current hosted setup path. It is designed to work
          for humans first, and it keeps the result machine-usable for CLI and AI
          flows.
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Create account</h2>
          <p className={styles.panelCopy}>
            For now, this creates one account and immediately issues the first
            API token for the default familiar setup behind that account.
          </p>

          <button
            className={styles.button}
            disabled={isPending}
            onClick={handleCreateAccount}
            type="button"
          >
            {isPending ? "Creating..." : "Create account"}
          </button>

          {status ? <p className={styles.status}>{status}</p> : null}
        </section>

        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>CLI direction</h2>
          <p className={styles.panelCopy}>
            The intended primary setup path for humans and AI agents is:
          </p>
          <pre className={styles.code}>
            <code>npx @familiar/cli@latest init</code>
          </pre>
          <p className={styles.panelCopy}>
            The package is not published yet, so this page is the working hosted
            path today.
          </p>
        </aside>

        <aside className={styles.panel}>
          <h2 className={styles.panelTitle}>Why this path</h2>
          <ol className={styles.asideList}>
            <li>The account is created in one step.</li>
            <li>The token is usable from curl, a CLI, or an AI agent.</li>
            <li>No passkey or email workflow is required yet.</li>
            <li>Passkeys can still be added later for the dashboard path.</li>
          </ol>
        </aside>
      </div>

      {result ? (
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Your API token</h2>
          <p className={styles.panelCopy}>
            Copy this token now. This page is the only place it is shown in full.
          </p>
          <div className={styles.result}>
            <div className={styles.token}>{result.token.value}</div>
            <pre className={styles.code}>
              <code>{curlExample(result.token.value)}</code>
            </pre>
          </div>
        </section>
      ) : null}
    </section>
  );
};
