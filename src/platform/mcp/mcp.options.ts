import {
	createRequestStateCodec,
	type McpServerOptions,
	type McpTransport,
	type StreamableHttpTransportOptions,
} from "@rekog/mcp-nest";
import { resourceMetadataUrl } from "../auth/www-authenticate";
import type { AppConfig } from "../config/config.schema";

/** The one MCP revision both transports serve (FR-4). */
export const MCP_PROTOCOL_VERSION = "2026-07-28";

type HttpTransportConfig = Pick<
	AppConfig,
	"MCP_ALLOWED_ORIGINS" | "MCP_ALLOWED_HOSTS" | "MCP_PUBLIC_URL"
>;

type StrategyConfig = Pick<
	AppConfig,
	| "MCP_SERVER_NAME"
	| "MCP_SERVER_VERSION"
	| "MCP_REQUEST_STATE_SECRET"
	| "MCP_INPUT_MAX_ROUNDS"
	| "MCP_INPUT_ROUND_TIMEOUT_MS"
>;

// `tools/list` and `resources/*` are filtered per caller, so `public` would hand one caller's results
// to another. Every cacheable result stays private (spec §2).
const PRIVATE = { cacheScope: "private" } as const;

/**
 * Streamable HTTP options. Stateless by default: `statefulMode` is legacy-era only and is never set
 * (spec §5). `mount: false` because `McpHttpController` owns the route, so guards apply.
 * `stepUpAuthorization` answers a `@ToolScopes` shortfall with 403 and an `insufficient_scope`
 * challenge naming the scopes, so clients can step up (spec §3).
 */
export function httpTransportOptions(
	config: HttpTransportConfig,
): StreamableHttpTransportOptions {
	return {
		protocol: "modern-only",
		responseMode: "auto",
		mount: false,
		stepUpAuthorization: {
			resourceMetadataUrl: resourceMetadataUrl(config.MCP_PUBLIC_URL),
		},
		security: {
			...(config.MCP_ALLOWED_ORIGINS && {
				allowedOrigins: config.MCP_ALLOWED_ORIGINS,
			}),
			...(config.MCP_ALLOWED_HOSTS && {
				allowedHosts: config.MCP_ALLOWED_HOSTS,
			}),
		},
	};
}

/**
 * Strategy options shared by both entry points. No `serverMutator` and no dynamic registration:
 * tool definitions are static code reviewed through PRs (spec §2).
 */
export function strategyOptions(
	config: StrategyConfig,
	transports: McpTransport[],
): McpServerOptions {
	const codec = createRequestStateCodec({
		key: config.MCP_REQUEST_STATE_SECRET,
	});
	return {
		name: config.MCP_SERVER_NAME,
		version: config.MCP_SERVER_VERSION,
		transports,
		cacheHints: {
			"tools/list": PRIVATE,
			"prompts/list": PRIVATE,
			"resources/list": PRIVATE,
			"resources/templates/list": PRIVATE,
			"resources/read": PRIVATE,
			"server/discover": PRIVATE,
		},
		// The key is shared by every replica, so a retried round can land on any of them.
		requestState: { verify: codec.verify },
		inputRequired: {
			maxRounds: config.MCP_INPUT_MAX_ROUNDS,
			roundTimeoutMs: config.MCP_INPUT_ROUND_TIMEOUT_MS,
		},
	};
}
