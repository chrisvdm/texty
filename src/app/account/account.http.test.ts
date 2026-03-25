import assert from "node:assert/strict";
import test from "node:test";

import {
  createHandleCreateAccountEndpoint,
  createHandleGetAccountEndpoint,
} from "./account.http-core.ts";
import {
  jsonError,
  jsonResponse,
  readJson,
  getRequestId,
} from "../provider/provider.http.ts";

const sharedDeps = {
  getRequestId,
  readJson,
  jsonResponse,
  jsonError,
};

test("create account endpoint returns account and first token", async () => {
  const endpoint = createHandleCreateAccountEndpoint({
    ...sharedDeps,
    authenticateAccountToken: async () => null,
    createAccountWithInitialToken: async () => ({
      account: {
        id: "acct_123",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      token: {
        value: "fam_secret",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/accounts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-Id": "req_123",
      },
      body: JSON.stringify({
      }),
    }),
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    account: {
      id: "acct_123",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    token: {
      value: "fam_secret",
      prefix: "fam_secr",
      last_four: "cret",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    request_id: "req_123",
  });
});

test("get account endpoint resolves account from bearer token", async () => {
  const endpoint = createHandleGetAccountEndpoint({
    ...sharedDeps,
    createAccountWithInitialToken: async () => {
      throw new Error("should not create account");
    },
    authenticateAccountToken: async () => ({
      account: {
        id: "acct_123",
        defaultSetupId: "setup_123",
        createdAt: "2026-03-25T10:00:00.000Z",
      },
      token: {
        id: "tok_123",
        prefix: "fam_secr",
        lastFour: "cret",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastUsedAt: "2026-03-25T10:01:00.000Z",
      },
    }),
  });

  const response = await endpoint({
    request: new Request("https://example.com/api/v1/account", {
      method: "GET",
      headers: {
        Authorization: "Bearer fam_secret",
        "X-Request-Id": "req_456",
      },
    }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    account: {
      id: "acct_123",
      created_at: "2026-03-25T10:00:00.000Z",
    },
    setup: {
      id: "setup_123",
    },
    token: {
      id: "tok_123",
      prefix: "fam_secr",
      last_four: "cret",
      created_at: "2026-03-25T10:00:00.000Z",
      last_used_at: "2026-03-25T10:01:00.000Z",
    },
    request_id: "req_456",
  });
});
