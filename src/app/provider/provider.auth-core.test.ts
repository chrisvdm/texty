import assert from "node:assert/strict";
import test from "node:test";

import {
  authenticateProviderRequestWithConfigs,
  normalizeProviderConfigMap,
} from "./provider.auth-core.ts";

test("normalizeProviderConfigMap accepts string token shorthand", () => {
  const result = normalizeProviderConfigMap(
    '{"provider_a":"dev-token"}',
  );

  assert.deepEqual(result, {
    provider_a: {
      token: "dev-token",
    },
  });
});

test("normalizeProviderConfigMap trims tokens and base URLs", () => {
  const result = normalizeProviderConfigMap(
    '{"provider_a":{"token":"  dev-token  ","baseUrl":"https://example.com/root/"}}',
  );

  assert.deepEqual(result, {
    provider_a: {
      token: "dev-token",
      baseUrl: "https://example.com/root",
    },
  });
});

test("normalizeProviderConfigMap rejects invalid JSON", () => {
  assert.throws(
    () => normalizeProviderConfigMap("{nope"),
    /TEXTY_PROVIDER_CONFIG is not valid JSON\./,
  );
});

test("normalizeProviderConfigMap rejects empty tokens", () => {
  assert.throws(
    () =>
      normalizeProviderConfigMap(
        '{"provider_a":{"token":"   "}}',
      ),
    /missing a token/i,
  );
});

test("normalizeProviderConfigMap rejects invalid base URLs", () => {
  assert.throws(
    () =>
      normalizeProviderConfigMap(
        '{"provider_a":{"token":"dev-token","baseUrl":"ftp://example.com"}}',
      ),
    /must use http or https/i,
  );
});

test("authenticateProviderRequestWithConfigs rejects missing bearer tokens", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com"),
    providerId: "provider_a",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 401,
    error: {
      code: "unauthenticated",
      message: "Missing bearer token.",
    },
  });
});

test("authenticateProviderRequestWithConfigs rejects unknown executors", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com", {
      headers: {
        Authorization: "Bearer dev-token",
      },
    }),
    providerId: "missing_executor",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
      },
    },
  });

  assert.deepEqual(result, {
    ok: false,
    status: 403,
    error: {
      code: "forbidden",
      message: "Unknown provider.",
    },
  });
});

test("authenticateProviderRequestWithConfigs accepts matching bearer tokens", () => {
  const result = authenticateProviderRequestWithConfigs({
    request: new Request("https://example.com", {
      headers: {
        Authorization: "Bearer dev-token",
      },
    }),
    providerId: "provider_a",
    providerConfigs: {
      provider_a: {
        token: "dev-token",
        baseUrl: "https://example.com/root",
      },
    },
  });

  assert.deepEqual(result, {
    ok: true,
    providerConfig: {
      token: "dev-token",
      baseUrl: "https://example.com/root",
    },
  });
});
