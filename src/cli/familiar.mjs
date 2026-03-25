#!/usr/bin/env node

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_BASE_URL =
  process.env.FAMILIAR_BASE_URL?.trim() || "https://familiar.chrsvdmrw.dev";
const CONFIG_DIR = path.join(os.homedir(), ".codex", "familiar");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");

const print = (message = "") => process.stdout.write(`${message}\n`);
const printError = (message) => process.stderr.write(`${message}\n`);

const helpText = `familiar

Usage:
  familiar init [--host <url>]
  familiar account create [--host <url>]
  familiar account show [--host <url>] [--token <token>]
  familiar whoami [--host <url>] [--token <token>]
  familiar --help

Commands:
  init            Create an account, issue the first API token, and store it locally.
  account create  Create an account and issue the first API token.
  account show    Show the account for the current API token.
  whoami          Alias for account show.

Options:
  --host <url>    Base URL for the familiar API. Default: ${DEFAULT_BASE_URL}
  --token <token> Use a token directly instead of the stored local token.
  --help          Show this help text.
`;

const parseArgs = (argv) => {
  const positionals = [];
  let host = DEFAULT_BASE_URL;
  let token;

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];

    if (value === "--help" || value === "-h") {
      return {
        help: true,
        positionals: [],
        host,
        token,
      };
    }

    if (value === "--host") {
      host = argv[index + 1]?.trim() || host;
      index += 1;
      continue;
    }

    if (value === "--token") {
      token = argv[index + 1]?.trim();
      index += 1;
      continue;
    }

    positionals.push(value);
  }

  return {
    help: false,
    positionals,
    host,
    token,
  };
};

const ensureConfigDir = async () => {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
};

const saveConfig = async (config) => {
  await ensureConfigDir();
  await fs.writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
};

const loadConfig = async () => {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const resolveToken = async (explicitToken) => {
  if (explicitToken?.trim()) {
    return explicitToken.trim();
  }

  const config = await loadConfig();
  return config?.token?.trim() || null;
};

const postJson = async ({ url, body, token }) => {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const getJson = async ({ url, token }) => {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Request failed: ${response.status}`);
  }

  return payload;
};

const createAccount = async ({ host, shouldPersist }) => {
  const payload = await postJson({
    url: `${host.replace(/\/$/, "")}/api/v1/accounts`,
    body: {},
  });

  if (shouldPersist) {
    await saveConfig({
      host,
      token: payload.token.value,
      account_id: payload.account.id,
      created_at: new Date().toISOString(),
    });
  }

  print(`Account ID: ${payload.account.id}`);
  print(`API Token: ${payload.token.value}`);

  if (shouldPersist) {
    print(`Stored token at: ${CONFIG_PATH}`);
  }
};

const showAccount = async ({ host, token }) => {
  const resolvedToken = await resolveToken(token);

  if (!resolvedToken) {
    throw new Error(
      "No API token found. Run `familiar init` or pass `--token <token>`.",
    );
  }

  const payload = await getJson({
    url: `${host.replace(/\/$/, "")}/api/v1/account`,
    token: resolvedToken,
  });

  print(`Account ID: ${payload.account.id}`);
  print(`Setup ID: ${payload.setup.id}`);
  print(`Token ID: ${payload.token.id}`);
  print(`Token Prefix: ${payload.token.prefix}`);
};

const main = async () => {
  const { help, positionals, host, token } = parseArgs(process.argv.slice(2));

  if (help || positionals.length === 0) {
    print(helpText);
    return;
  }

  const command = positionals.join(" ");

  if (command === "init") {
    await createAccount({ host, shouldPersist: true });
    return;
  }

  if (command === "account create") {
    await createAccount({ host, shouldPersist: false });
    return;
  }

  if (command === "account show" || command === "whoami") {
    await showAccount({ host, token });
    return;
  }

  throw new Error(`Unknown command: ${command}\n\n${helpText}`);
};

main().catch((error) => {
  printError(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
