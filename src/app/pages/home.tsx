import { ChatShell } from "./chat-shell";

export const Home = ({ ctx }: { ctx: { session: { chatId: string } } }) => {
  return <ChatShell chatSessionId={ctx.session.chatId} />;
};
