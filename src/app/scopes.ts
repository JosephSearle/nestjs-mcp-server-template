// The server's OAuth scope names. Rename BASE_SCOPE per server, and register the same names with
// your issuer (docs/auth/). Every scope here is published as scopes_supported.

/** Lets a caller use the server at all. Set AUTH_REQUIRED_SCOPES to it in production. */
export const BASE_SCOPE = "mcp:access";

/** Every scope the server defines. Add a scope here when a tool needs one. */
export const SCOPES = [BASE_SCOPE] as const;
