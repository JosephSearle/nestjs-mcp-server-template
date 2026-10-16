import "../mcp/fixtures/http-env";
import type { Client } from "@modelcontextprotocol/client";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { SpanKind } from "@opentelemetry/api";
import { createHttpApp } from "../../../src/platform/mcp/start-mcp";
import { connectHttp } from "../../support/mcp-client";
import { installTestTelemetry } from "../../support/telemetry";
import { authStub } from "../mcp/fixtures/http-env";
import { FailingModule } from "./fixtures/failing.module";

const telemetry = installTestTelemetry();
const CALLER_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const CALLER_SPAN_ID = "b7ad6b7169203331";

let app: NestExpressApplication;
let client: Client;

beforeAll(async () => {
	app = await createHttpApp(FailingModule, { logger: false });
	await app.listen(0, "127.0.0.1");
	client = await connectHttp(
		`${await app.getUrl()}/mcp`,
		await authStub.sign(),
	);
});

afterAll(async () => {
	await client?.close();
	await app?.close();
});

beforeEach(() => telemetry.reset());

const spanNamed = (name: string) =>
	telemetry.spans.getFinishedSpans().find((span) => span.name === name);

describe("MCP telemetry", () => {
	it("names spans <mcp.method.name> <name> for tools, resources and prompts", async () => {
		await client.callTool({ name: "echo", arguments: { message: "hi" } });
		await client.readResource({ uri: "example://about" });
		await client.getPrompt({
			name: "summarise",
			arguments: { text: "Some text." },
		});

		const tool = spanNamed("tools/call echo");
		expect(tool?.kind).toBe(SpanKind.SERVER);
		expect(tool?.attributes).toMatchObject({
			"mcp.method.name": "tools/call",
			"gen_ai.tool.name": "echo",
			"gen_ai.operation.name": "execute_tool",
			"mcp.protocol.version": "2026-07-28",
			"network.transport": "tcp",
		});
		expect(
			telemetry.spans
				.getFinishedSpans()
				.find((span) => span.name.startsWith("resources/read "))?.attributes,
		).toMatchObject({ "mcp.resource.uri": "example://about" });
		expect(spanNamed("prompts/get summarise")?.attributes).toMatchObject({
			"gen_ai.prompt.name": "summarise",
		});
	});

	it("parents the span on the _meta trace context", async () => {
		await client.callTool({
			name: "echo",
			arguments: { message: "hi" },
			_meta: { traceparent: `00-${CALLER_TRACE_ID}-${CALLER_SPAN_ID}-01` },
		});

		const span = spanNamed("tools/call echo");
		expect(span?.spanContext().traceId).toBe(CALLER_TRACE_ID);
		expect(span?.parentSpanContext?.spanId).toBe(CALLER_SPAN_ID);
	});

	it("records duration by method and tool, including lists", async () => {
		await client.listTools();
		await client.callTool({ name: "echo", arguments: { message: "hi" } });

		const points = await telemetry.points("mcp.server.operation.duration");
		const attributes = points.map((point) => point.attributes);
		expect(attributes).toContainEqual({ "mcp.method.name": "tools/list" });
		expect(attributes).toContainEqual({
			"mcp.method.name": "tools/call",
			"gen_ai.tool.name": "echo",
		});
	});

	it("counts an error sent before dispatch by its JSON-RPC code", async () => {
		await expect(
			client.callTool({ name: "missing", arguments: {} }),
		).rejects.toThrow("Unknown tool");

		const errors = await telemetry.points("mcp.server.errors");
		expect(errors.map((point) => point.attributes)).toContainEqual({
			"mcp.method.name": "tools/call",
			"gen_ai.tool.name": "missing",
			"error.type": "-32602",
			"rpc.response.status_code": "-32602",
		});
	});

	// Nest's RPC exception filter masks a protocol error thrown by a tool, so the client gets an
	// isError result. The span keeps the code the handler threw; the count records what was sent.
	it("keeps a tool's protocol error code on its span", async () => {
		const result = await client.callTool({ name: "rejects", arguments: {} });
		expect(result.isError).toBe(true);

		expect(spanNamed("tools/call rejects")?.attributes).toMatchObject({
			"error.type": "-32602",
			"rpc.response.status_code": "-32602",
		});
		const errors = await telemetry.points("mcp.server.errors");
		expect(errors.map((point) => point.attributes)).toContainEqual({
			"mcp.method.name": "tools/call",
			"gen_ai.tool.name": "rejects",
			"error.type": "tool_error",
		});
	});

	it("counts a tool that throws as a tool error", async () => {
		const result = await client.callTool({ name: "breaks", arguments: {} });
		expect(result.isError).toBe(true);

		expect(spanNamed("tools/call breaks")?.attributes).toMatchObject({
			"error.type": "tool_error",
		});
	});
});
