import { ChatShell } from "./chat-shell";
import type { BrowserSession } from "../session/session";

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const Home = ({ ctx }: { ctx: { session?: BrowserSession } }) => {
  return <ChatShell session={requireSession(ctx.session)} />;
};
