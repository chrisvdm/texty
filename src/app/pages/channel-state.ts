import {
  getProviderHydratedState,
  WEB_PROVIDER_ID,
} from "../provider/provider.service";
import {
  getBrowserSessionIdFromRequest,
  type BrowserSession,
} from "../session/session";

type PageContext = {
  session?: BrowserSession;
};

const requireSession = (session: BrowserSession | undefined) => {
  if (!session) {
    throw new Error("Browser session is required for this page.");
  }

  return session;
};

export const loadBrowserChannelState = async ({
  ctx,
  request,
  channelType,
}: {
  ctx: PageContext;
  request: Request;
  channelType: "web" | "sandbox_messenger";
}) => {
  const session = requireSession(ctx.session);
  const browserUserId =
    getBrowserSessionIdFromRequest(request) || session.activeThreadId;

  return getProviderHydratedState({
    providerId: WEB_PROVIDER_ID,
    userId: browserUserId,
    channel: {
      type: channelType,
      id: browserUserId,
    },
  });
};
