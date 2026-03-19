import type { ChatMessage, ChatThreadSummary } from "../chat/shared";
import {
  getProviderHydratedState,
  WEB_PROVIDER_ID,
} from "../provider/provider.service";
import type { BrowserSession } from "../session/session";
import { getBrowserSessionIdFromRequest } from "../session/session";
import { SandboxMessengerClient } from "./sandbox-messenger.client";

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const SandboxMessenger = async ({
  ctx,
  request,
}: {
  ctx: { session?: BrowserSession };
  request: Request;
}) => {
  const session = requireSession(ctx.session);
  const browserUserId = getBrowserSessionIdFromRequest(request) || session.activeThreadId;
  const providerState = await getProviderHydratedState({
    providerId: WEB_PROVIDER_ID,
    userId: browserUserId,
    channel: {
      type: "sandbox_messenger",
      id: browserUserId,
    },
    fallbackThreadId: session.activeThreadId,
    fallbackGlobalMemory: session.globalMemory,
    fallbackThreads: session.threads,
    fallbackModel: session.selectedModel,
  });
  const messages: ChatMessage[] = providerState.session.messages;
  const threads: ChatThreadSummary[] = providerState.threads;

  return (
    <SandboxMessengerClient
      activeThreadId={providerState.activeThreadId}
      initialMessages={messages}
      initialModel={providerState.selectedModel}
      initialThreads={threads}
    />
  );
};
