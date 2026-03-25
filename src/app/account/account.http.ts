import { getRequestId, jsonError, jsonResponse, readJson } from "../provider/provider.http";

import {
  authenticateAccountToken,
  createAccountWithInitialToken,
} from "./account.service";
import {
  createHandleCreateAccountEndpoint,
  createHandleGetAccountEndpoint,
} from "./account.http-core";

export const handleCreateAccountEndpoint = createHandleCreateAccountEndpoint({
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
});

export const handleGetAccountEndpoint = createHandleGetAccountEndpoint({
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
  authenticateAccountToken,
  createAccountWithInitialToken,
});
