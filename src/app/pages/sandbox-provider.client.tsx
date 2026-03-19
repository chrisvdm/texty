"use client";

import { useState } from "react";

import styles from "./sandbox-provider.module.css";

const DEFAULT_TOOLS = JSON.stringify(
  {
    provider_id: "provider_a",
    user_id: "user_123",
    tools: [
      {
        tool_name: "spreadsheet.update_row",
        description: "Update a spreadsheet row",
        input_schema: {
          type: "object",
          properties: {
            sheet: { type: "string" },
            row_id: { type: "string" },
            values: { type: "object" },
          },
          required: ["sheet", "row_id", "values"],
        },
        policy: {
          confirmation: "required",
        },
        status: "active",
      },
    ],
  },
  null,
  2,
);

const pretty = (value: unknown) => JSON.stringify(value, null, 2);

const asRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : null;

export const SandboxProviderClient = () => {
  const [providerId, setProviderId] = useState("provider_a");
  const [token, setToken] = useState("");
  const [userId, setUserId] = useState("user_123");
  const [channelType, setChannelType] = useState("web");
  const [channelId, setChannelId] = useState("local-harness");
  const [threadId, setThreadId] = useState("");
  const [message, setMessage] = useState("Update the client spreadsheet");
  const [toolPayload, setToolPayload] = useState(DEFAULT_TOOLS);
  const [result, setResult] = useState<string>("");
  const [isPending, setIsPending] = useState(false);

  const request = async ({
    url,
    method,
    body,
  }: {
    url: string;
    method: "GET" | "POST" | "PATCH" | "DELETE";
    body?: unknown;
  }) => {
    setIsPending(true);
    setResult("");

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = (await response.json()) as unknown;
      const payloadRecord = asRecord(payload);

      setResult(pretty(payload));

      const payloadThreadId = payloadRecord?.thread_id;

      if (typeof payloadThreadId === "string") {
        setThreadId(payloadThreadId);
      }
    } catch (error) {
      setResult(
        pretty({
          error: error instanceof Error ? error.message : "Request failed",
        }),
      );
    } finally {
      setIsPending(false);
    }
  };

  return (
    <section className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Provider Sandbox</h1>
        <p className={styles.intro}>
          Exercise the real provider API routes directly from the browser.
        </p>
      </header>

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Identity</h2>
          <label className={styles.field}>
            <span>Provider ID</span>
            <input value={providerId} onChange={(e) => setProviderId(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>API Token</span>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Bearer token"
            />
          </label>
          <label className={styles.field}>
            <span>User ID</span>
            <input value={userId} onChange={(e) => setUserId(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Channel Type</span>
            <input value={channelType} onChange={(e) => setChannelType(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Channel ID</span>
            <input value={channelId} onChange={(e) => setChannelId(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span>Thread ID</span>
            <input
              value={threadId}
              onChange={(e) => setThreadId(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Actions</h2>
          <label className={styles.field}>
            <span>Message</span>
            <textarea
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
          <div className={styles.actions}>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                request({
                  url: "/api/v1/conversation/input",
                  method: "POST",
                  body: {
                    provider_id: providerId,
                    user_id: userId,
                    ...(threadId ? { thread_id: threadId } : {}),
                    input: {
                      kind: "text",
                      text: message,
                    },
                    channel: {
                      type: channelType,
                      id: channelId,
                    },
                    context: {
                      external_memories: [],
                    },
                  },
                })
              }
            >
              Send message
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                request({
                  url: "/api/v1/threads",
                  method: "POST",
                  body: {
                    provider_id: providerId,
                    user_id: userId,
                    title: "Sandbox thread",
                    is_private: false,
                    channel: {
                      type: channelType,
                      id: channelId,
                    },
                  },
                })
              }
            >
              Create thread
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                request({
                  url: `/api/v1/providers/${providerId}/users/${userId}/threads`,
                  method: "GET",
                })
              }
            >
              List threads
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={() =>
                request({
                  url: `/api/v1/providers/${providerId}/users/${userId}/memory`,
                  method: "GET",
                })
              }
            >
              Read memory
            </button>
            <button
              type="button"
              disabled={isPending || !threadId}
              onClick={() =>
                request({
                  url: `/api/v1/threads/${threadId}/memory?provider_id=${encodeURIComponent(
                    providerId,
                  )}&user_id=${encodeURIComponent(userId)}`,
                  method: "GET",
                })
              }
            >
              Read thread memory
            </button>
          </div>
        </section>

        <section className={styles.panel}>
          <h2 className={styles.panelTitle}>Tool Sync</h2>
          <label className={styles.field}>
            <span>Tool payload</span>
            <textarea
              rows={14}
              value={toolPayload}
              onChange={(e) => setToolPayload(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              request({
                url: `/api/v1/providers/${providerId}/users/${userId}/tools/sync`,
                method: "POST",
                body: JSON.parse(toolPayload),
              })
            }
          >
            Sync tools
          </button>
        </section>
      </div>

      <section className={styles.panel}>
        <h2 className={styles.panelTitle}>Result</h2>
        <pre className={styles.output}>{result || "// response will appear here"}</pre>
      </section>
    </section>
  );
};
