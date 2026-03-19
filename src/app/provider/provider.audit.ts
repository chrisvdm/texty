type ProviderAuditEvent = {
  event: string;
  requestId?: string;
  providerId?: string;
  userId?: string;
  threadId?: string;
  channelType?: string;
  channelId?: string;
  status?: "ok" | "error";
  code?: string;
  detail?: string;
  metadata?: Record<string, unknown>;
};

export const logProviderAudit = (event: ProviderAuditEvent) => {
  console.info(
    JSON.stringify({
      scope: "texty.provider",
      at: new Date().toISOString(),
      ...event,
    }),
  );
};
