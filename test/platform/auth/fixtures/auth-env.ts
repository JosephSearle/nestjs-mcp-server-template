import { ISSUER, startAuthStub } from "../../../support/auth";

// Imported first by the auth specs, before config is validated. A base scope gate and a one-hour
// lifetime cap, so both rejections can be tested.
export const authStub = startAuthStub();
process.env.AUTH_ISSUER = ISSUER;
process.env.AUTH_REQUIRED_SCOPES = "mcp:access";
process.env.AUTH_MAX_TOKEN_LIFETIME_SECONDS = "3600";
process.env.LOG_LEVEL = "silent";
