"use client";

import { startTransition, useEffect, useRef, useState } from "react";

import {
  createChatThread,
  deleteChatThread,
  renameChatThread,
  selectChatThread,
  sendChatMessage,
} from "../chat/chat.service";
import type {
  ChatMessage,
  ChatThreadSummary,
} from "../chat/shared";
import styles from "./chat.module.css";

type ChatClientProps = {
  activeThreadId: string;
  initialMessages: ChatMessage[];
  initialThreads: ChatThreadSummary[];
};

export const ChatClient = ({
  activeThreadId: initialActiveThreadId,
  initialMessages,
  initialThreads,
}: ChatClientProps) => {
  const [activeThreadId, setActiveThreadId] = useState(initialActiveThreadId);
  const [messages, setMessages] = useState(initialMessages);
  const [threads, setThreads] = useState(initialThreads);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [model, setModel] = useState<string>("openai/gpt-4o-mini");
  const logRef = useRef<HTMLDivElement | null>(null);
  const pendingAssistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveThreadId(initialActiveThreadId);
    setMessages(initialMessages);
    setThreads(initialThreads);
  }, [initialActiveThreadId, initialMessages, initialThreads]);

  useEffect(() => {
    const container = logRef.current;
    const pendingAssistantId = pendingAssistantIdRef.current;

    if (!container || !pendingAssistantId) {
      return;
    }

    const pendingAssistant = container.querySelector<HTMLElement>(
      `[data-message-id="${pendingAssistantId}"]`,
    );

    if (!pendingAssistant) {
      return;
    }

    container.scrollTo({
      top: Math.max(0, pendingAssistant.offsetTop - 16),
      behavior: "smooth",
    });
  }, [messages]);

  const sendMessage = (rawMessage: string) => {
    const content = rawMessage.trim();

    if (!content || isPending) {
      return;
    }

    const previousMessages = messages;
    const optimisticUserMessage: ChatMessage = {
      id: `optimistic-user-${crypto.randomUUID()}`,
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    const optimisticAssistantMessage: ChatMessage = {
      id: `optimistic-assistant-${crypto.randomUUID()}`,
      role: "assistant",
      content: "Thinking through the request...",
      createdAt: new Date().toISOString(),
    };

    setDraft("");
    setError(null);
    setIsPending(true);
    pendingAssistantIdRef.current = optimisticAssistantMessage.id;
    setMessages([
      ...previousMessages,
      optimisticUserMessage,
      optimisticAssistantMessage,
    ]);

    startTransition(async () => {
      try {
        const result = await sendChatMessage({
          content,
          threadId: activeThreadId,
        });
        setActiveThreadId(result.activeThreadId);
        setThreads(result.threads);
        setModel(result.model ?? "openai/gpt-4o-mini");
        setMessages(result.session.messages);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "Something went wrong while generating a reply.";

        setError(message);
        setMessages(previousMessages);
        setDraft(content);
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sendMessage(draft);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(draft);
    }
  };

  const openThread = (threadId: string) => {
    if (isPending || threadId === activeThreadId) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextThread = await selectChatThread(threadId);
        setActiveThreadId(nextThread.activeThreadId);
        setThreads(nextThread.threads);
        setMessages(nextThread.session.messages);
        setDraft("");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to open that thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const addThread = (isTemporary = false) => {
    if (isPending) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextThread = await createChatThread({ isTemporary });
        setActiveThreadId(nextThread.activeThreadId);
        setThreads(nextThread.threads);
        setMessages(nextThread.session.messages);
        setDraft("");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create a new thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const editThreadName = (threadId: string) => {
    if (isPending) {
      return;
    }

    const thread = threads.find((entry) => entry.id === threadId);

    if (!thread) {
      return;
    }

    const nextTitle = window.prompt("Rename thread", thread.title)?.trim();

    if (!nextTitle || nextTitle === thread.title) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextState = await renameChatThread({
          threadId,
          title: nextTitle,
        });
        setActiveThreadId(nextState.activeThreadId);
        setThreads(nextState.threads);
        setMessages(nextState.session.messages);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to rename that thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  const removeThread = (threadId: string) => {
    if (isPending) {
      return;
    }

    const thread = threads.find((entry) => entry.id === threadId);

    if (
      !thread ||
      !window.confirm(`Delete "${thread.title}"? This will also remove memory sourced from this thread.`)
    ) {
      return;
    }

    setError(null);
    setIsPending(true);

    startTransition(async () => {
      try {
        const nextState = await deleteChatThread(threadId);
        setActiveThreadId(nextState.activeThreadId);
        setThreads(nextState.threads);
        setMessages(nextState.session.messages);
        setDraft("");
      } catch (caughtError) {
        setError(
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to delete that thread.",
        );
      } finally {
        pendingAssistantIdRef.current = null;
        setIsPending(false);
      }
    });
  };

  return (
    <section className={styles.shell}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarPanel}>
          <div className={styles.sidebarHeader}>
            <div>
              <p className={styles.sidebarLabel}>Threads</p>
              <p className={styles.sidebarHint}>
                Session-backed conversations you can return to. Private chats stay isolated from global memory.
              </p>
            </div>
            <button
              type="button"
              className={styles.newThreadButton}
              onClick={() => addThread(false)}
              disabled={isPending}
            >
              New thread
            </button>
            <button
              type="button"
              className={styles.tempThreadButton}
              onClick={() => addThread(true)}
              disabled={isPending}
            >
              Private
            </button>
          </div>
          <div className={styles.threadList}>
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={
                  thread.id === activeThreadId
                    ? styles.threadRowActive
                    : styles.threadRow
                }
              >
                <button
                  type="button"
                  className={
                    thread.id === activeThreadId
                      ? styles.threadButtonActive
                      : styles.threadButton
                  }
                  onClick={() => openThread(thread.id)}
                  disabled={isPending}
                >
                  <span className={styles.threadTitleRow}>
                    <span className={styles.threadTitle}>{thread.title}</span>
                    {thread.isTemporary ? (
                      <span className={styles.threadBadge}>Private</span>
                    ) : null}
                  </span>
                </button>
                <div className={styles.threadActions}>
                  <button
                    type="button"
                    className={styles.renameThreadButton}
                    onClick={() => editThreadName(thread.id)}
                    disabled={isPending}
                    aria-label={`Rename ${thread.title}`}
                    title="Rename thread"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className={styles.deleteThreadButton}
                    onClick={() => removeThread(thread.id)}
                    disabled={isPending}
                    aria-label={`Delete ${thread.title}`}
                    title="Delete thread"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Status</p>
          <p className={styles.sidebarValue}>
            {isPending ? "Updating active thread..." : "Persisted in session"}
          </p>
        </div>
        <div className={styles.sidebarPanel}>
          <p className={styles.sidebarLabel}>Model</p>
          <p className={styles.sidebarValue}>{model}</p>
        </div>
      </div>

      <div className={styles.chatFrame}>
        <div className={styles.chatLogFrame}>
          <div className={styles.chatLog} ref={logRef}>
            {messages.map((message) => (
              <article
                key={message.id}
                data-message-id={message.id}
                className={
                  message.role === "user" ? styles.userMessage : styles.assistantMessage
                }
              >
                <p className={styles.messageRole}>{message.role}</p>
                <p className={styles.messageBody}>{message.content}</p>
              </article>
            ))}
          </div>
        </div>

        <form className={styles.composer} onSubmit={onSubmit}>
          <label className={styles.composerLabel} htmlFor="message">
            Message
          </label>
          <textarea
            id="message"
            name="message"
            className={styles.textarea}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ask for a launch plan, rewrite, code review, or customer insight summary."
            rows={5}
            disabled={isPending}
          />

          <div className={styles.composerFooter}>
            <p className={styles.helperText}>
              Full thread history survives refresh. Texty also keeps lightweight
              thread and user memory.
            </p>
            <button className={styles.submitButton} type="submit" disabled={isPending}>
              {isPending ? "Working..." : "Send"}
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
        </form>
      </div>
    </section>
  );
};
