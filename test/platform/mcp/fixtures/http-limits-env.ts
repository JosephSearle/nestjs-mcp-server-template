// Imported first by http-limits.spec.ts, before config is validated. Small limits keep it fast.
process.env.AUTH_ISSUER = "https://issuer.example.test";
process.env.MCP_MAX_REQUEST_BYTES = "1024";
process.env.MCP_REQUEST_TIMEOUT_MS = "250";
process.env.LOG_LEVEL = "silent";
