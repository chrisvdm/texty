import { ChatShell } from "./chat-shell";
import type { BrowserSession } from "../session/session";
import { getBrowserSessionIdFromRequest } from "../session/session";

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const Home = ({
  ctx,
  request,
}: {
  ctx: { session?: BrowserSession };
  request: Request;
}) => {
  const session = requireSession(ctx.session);
  const browserUserId = getBrowserSessionIdFromRequest(request) || session.activeThreadId;

  return <ChatShell session={session} browserUserId={browserUserId} />;
};
