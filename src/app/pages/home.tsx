import { ChatShell } from "./chat-shell";
import type { BrowserSession } from "../session/session";

export const Home = ({ ctx }: { ctx: { session: BrowserSession } }) => {
  return <ChatShell session={ctx.session} />;
};
