/**
 * The shape the transport uses for its own HTTP-level rejections: a JSON-RPC error with no id.
 * An empty or non-JSON body makes a conforming client conclude the server is legacy.
 */
export const jsonRpcError = (message: string) => ({
	jsonrpc: "2.0",
	error: { code: -32000, message },
	id: null,
});
