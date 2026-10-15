import {
	Client,
	StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";

/** A client pinned to the one revision the server speaks. */
export function modernClient(): Client {
	return new Client(
		{ name: "test", version: "0.0.0" },
		{ versionNegotiation: { mode: { pin: "2026-07-28" } } },
	);
}

export async function connectHttp(url: string): Promise<Client> {
	const client = modernClient();
	await client.connect(new StreamableHTTPClientTransport(new URL(url)));
	return client;
}

/** A 2025-era `initialize`, which both transports must reject. */
export const LEGACY_INITIALIZE = {
	jsonrpc: "2.0",
	id: 1,
	method: "initialize",
	params: {
		protocolVersion: "2025-06-18",
		capabilities: {},
		clientInfo: { name: "legacy", version: "0.0.0" },
	},
};

/** The JSON-RPC code for an unsupported protocol version. */
export const UNSUPPORTED_PROTOCOL_VERSION = -32022;
