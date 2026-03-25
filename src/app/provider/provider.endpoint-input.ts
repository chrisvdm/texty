export const requireNonEmptyString = (
  value: string | undefined,
  fieldName: string,
) => {
  const normalized = value?.trim();

  if (!normalized) {
    throw new Error(`${fieldName} is required.`);
  }

  return normalized;
};

export const resolveProviderIdFromInput = ({
  explicitProviderId,
  authenticatedProviderId,
}: {
  explicitProviderId?: string;
  authenticatedProviderId: string;
}) => {
  const normalizedExplicitProviderId = explicitProviderId?.trim();

  if (
    normalizedExplicitProviderId &&
    normalizedExplicitProviderId !== authenticatedProviderId
  ) {
    throw new Error("integration_id does not match the authenticated token.");
  }

  return normalizedExplicitProviderId ?? authenticatedProviderId;
};
