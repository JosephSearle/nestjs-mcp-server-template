import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { Writable } from "node:stream";
import { trace } from "@opentelemetry/api";
import pino from "pino";
import { pinoHttp } from "pino-http";
import {
	httpLoggerOptions,
	loggerOptions,
	REDACTED,
} from "../../../src/platform/telemetry/log-options";
import { pseudonymise } from "../../../src/platform/telemetry/pseudonym";
import { installTestTelemetry } from "../../support/telemetry";

installTestTelemetry();

const KEY = "k".repeat(32);

/** A stream that keeps each log line, parsed. */
function memoryStream() {
	const lines: Record<string, unknown>[] = [];
	const stream = new Writable({
		write(chunk, _encoding, callback) {
			for (const line of String(chunk).split("\n").filter(Boolean)) {
				lines.push(JSON.parse(line));
			}
			callback();
		},
	});
	return { lines, stream };
}

describe("app logger", () => {
	it("redacts token, secret and requestState keys at any depth", () => {
		const { lines, stream } = memoryStream();
		const logger = pino(loggerOptions({ level: "info" }), stream);

		logger.child({ refreshToken: "child-value" }).info(
			{
				accessToken: "a",
				nested: { clientSecret: "b", list: [{ id_token: "c" }] },
				requestState: "d",
				safe: "kept",
			},
			"hello",
		);

		const [line] = lines;
		expect(line).toMatchObject({
			level: "info",
			message: "hello",
			refreshToken: REDACTED,
			accessToken: REDACTED,
			nested: { clientSecret: REDACTED, list: [{ id_token: REDACTED }] },
			requestState: REDACTED,
			safe: "kept",
		});
		expect(JSON.stringify(line)).not.toMatch(/child-value|"a"|"b"|"c"|"d"/);
	});

	it("adds trace_id and span_id from the active span", () => {
		const { lines, stream } = memoryStream();
		const logger = pino(loggerOptions({ level: "info" }), stream);

		const ids = trace.getTracer("test").startActiveSpan("work", (span) => {
			logger.info("inside");
			span.end();
			return span.spanContext();
		});
		logger.info("outside");

		expect(lines[0]).toMatchObject({
			trace_id: ids.traceId,
			span_id: ids.spanId,
		});
		expect(lines[1]).not.toHaveProperty("trace_id");
	});
});

describe("request logger", () => {
	let server: Server;
	let url: string;
	const { lines, stream } = memoryStream();
	const middleware = pinoHttp(
		httpLoggerOptions({ level: "info", pseudonymKey: KEY }),
		stream,
	);

	beforeAll(async () => {
		server = createServer((req, res) => {
			Object.assign(req, { user: { sub: "user-123", email: "a@b.test" } });
			middleware(req, res);
			res.setHeader("set-cookie", "session=s");
			res.end("ok");
		});
		await new Promise<void>((resolve) =>
			server.listen(0, "127.0.0.1", resolve),
		);
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
	});

	afterAll(() => new Promise((resolve) => server.close(resolve)));

	it("redacts credentials, drops the client address and records only the pseudonym", async () => {
		await fetch(url, {
			headers: {
				authorization: "Bearer secret-token",
				cookie: "session=s",
				"x-api-token": "t",
			},
		});
		await new Promise((resolve) => setImmediate(resolve));

		const [line] = lines;
		expect(line).toMatchObject({
			message: "request completed",
			"enduser.pseudo.id": pseudonymise("user-123", KEY),
			req: {
				method: "GET",
				url: "/mcp",
				headers: {
					authorization: REDACTED,
					cookie: REDACTED,
					"x-api-token": REDACTED,
				},
			},
			res: { statusCode: 200, headers: { "set-cookie": REDACTED } },
		});
		const text = JSON.stringify(line);
		expect(text).not.toMatch(
			/remoteAddress|remotePort|127\.0\.0\.1:\d+"?,"?remote|user-123|a@b\.test|secret-token|session=s/,
		);
	});
});
