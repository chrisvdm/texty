import { route } from "rwsdk/router";

import {
  handleCreateAccountEndpoint,
  handleGetAccountEndpoint,
} from "./account.http";

export const accountRoutes = [
  route("/api/v1/accounts", handleCreateAccountEndpoint),
  route("/api/v1/account", handleGetAccountEndpoint),
];
