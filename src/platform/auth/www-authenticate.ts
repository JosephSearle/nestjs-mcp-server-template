/** Where the RFC 9728 metadata for `/mcp` is served, relative to the server root. */
export const RESOURCE_METADATA_PATH =
	"/.well-known/oauth-protected-resource/mcp";

/** The absolute metadata URL that every challenge points to. `publicUrl` has no trailing slash. */
export const resourceMetadataUrl = (publicUrl: string) =>
	`${publicUrl}${RESOURCE_METADATA_PATH}`;

const quote = (value: string) => value.replace(/["\\]/g, "\\$&");

/**
 * The 401 challenge (RFC 6750 §3, MCP authorization). A request with no token gets no error code;
 * a request with a bad one gets `invalid_token`.
 */
export function unauthorizedChallenge(
	metadataUrl: string,
	tokenPresent: boolean,
): string {
	const params = [`resource_metadata="${quote(metadataUrl)}"`];
	if (tokenPresent) {
		params.unshift(`error="invalid_token"`);
	}
	return `Bearer ${params.join(", ")}`;
}

/** The 403 challenge for missing scopes, naming the scopes to ask for so clients can step up. */
export function insufficientScopeChallenge(
	metadataUrl: string,
	scopes: readonly string[],
): string {
	return [
		`Bearer error="insufficient_scope"`,
		`scope="${quote(scopes.join(" "))}"`,
		`resource_metadata="${quote(metadataUrl)}"`,
	].join(", ");
}
