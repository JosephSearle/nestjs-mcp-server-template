import { responseOutcome } from "../../../src/platform/telemetry/response-outcome";

const json = (message: unknown) => JSON.stringify(message);

describe("responseOutcome", () => {
	it("reads a JSON-RPC error code", () => {
		expect(
			responseOutcome(
				json({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "x" } }),
				"application/json",
			),
		).toEqual({ code: -32602 });
	});

	it("reads an isError tool result", () => {
		expect(
			responseOutcome(
				json({ jsonrpc: "2.0", id: 1, result: { isError: true } }),
				"application/json; charset=utf-8",
			),
		).toEqual({ toolError: true });
	});

	it("reports a success as no error", () => {
		expect(
			responseOutcome(json({ jsonrpc: "2.0", id: 1, result: { content: [] } })),
		).toEqual({});
	});

	it("reads the response from the last SSE message", () => {
		const body = [
			"event: message",
			`data: ${json({ jsonrpc: "2.0", method: "notifications/progress", params: {} })}`,
			"",
			"event: message",
			`data: ${json({ jsonrpc: "2.0", id: 1, error: { code: -32603, message: "x" } })}`,
			"",
		].join("\n");
		expect(responseOutcome(body, "text/event-stream")).toEqual({
			code: -32603,
		});
	});

	it("is undefined for a body that is not a response", () => {
		expect(responseOutcome("not json", "application/json")).toBeUndefined();
		expect(responseOutcome("", "text/event-stream")).toBeUndefined();
	});
});
