import { ISSUER, startAuthStub } from "../../../support/auth";

// Imported first by the HTTP specs. Config is validated when platform.module.ts is imported, so
// the environment must be set before that. Jest gives each test file its own process.env.
// The issuer is a stub found through discovery, so every request carries a real signed token.
export const authStub = startAuthStub();
process.env.AUTH_ISSUER = ISSUER;
process.env.LOG_LEVEL = "silent";
