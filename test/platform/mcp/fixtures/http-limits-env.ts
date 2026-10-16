import { ISSUER, startAuthStub } from "../../../support/auth";

// Imported first by http-limits.spec.ts, before config is validated. Small limits keep it fast.
export const authStub = startAuthStub();
process.env.AUTH_ISSUER = ISSUER;
process.env.MCP_MAX_REQUEST_BYTES = "1024";
process.env.MCP_REQUEST_TIMEOUT_MS = "250";
process.env.LOG_LEVEL = "silent";
