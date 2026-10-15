import type { ServerResponse } from "node:http";

/** Responses are read up to this size to find their outcome; anything longer is ignored. */
export const OUTCOME_READ_LIMIT = 256 * 1024;

export interface ResponseOutcome {
	/** The JSON-RPC error code, when the response is an error. */
	code?: number;
	/** True when the response is a tool result with `isError: true`. */
	toolError?: boolean;
}

type Message = {
	result?: { isError?: unknown };
	error?: { code?: unknown };
};

const isResponse = (value: unknown): value is Message =>
	typeof value === "object" &&
	value !== null &&
	("result" in value || "error" in value);

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * The outcome of a JSON-RPC response body, sent as JSON or as an SSE stream (the last `data:`
 * message that is a response). Undefined when the body holds no response, or was cut short.
 */
export function responseOutcome(
	body: string,
	contentType = "",
): ResponseOutcome | undefined {
	const messages = contentType.includes("text/event-stream")
		? body
				.split("\n")
				.filter((line) => line.startsWith("data:"))
				.map((line) => parse(line.slice(5).trim()))
		: [parse(body)];
	const message = messages.filter(isResponse).at(-1);
	if (!message) {
		return undefined;
	}
	const code = message.error?.code;
	if (typeof code === "number") {
		return { code };
	}
	return message.result?.isError === true ? { toolError: true } : {};
}

/**
 * Keeps a copy of what is written to `res`, up to `OUTCOME_READ_LIMIT` bytes. The MCP handler
 * writes the response itself, so this is the only place its outcome is visible: errors raised
 * before the Nest pipeline, such as an unknown tool, are sent with HTTP 200 (ADR-0005).
 */
export function captureBody(res: ServerResponse): () => string | undefined {
	const chunks: Buffer[] = [];
	let size = 0;
	let truncated = false;

	const keep = (chunk: unknown, encoding: unknown) => {
		if (chunk === undefined || chunk === null || typeof chunk === "function") {
			return;
		}
		const buffer =
			chunk instanceof Uint8Array
				? Buffer.from(chunk)
				: Buffer.from(
						String(chunk),
						typeof encoding === "string"
							? (encoding as BufferEncoding)
							: "utf8",
					);
		if (size + buffer.length > OUTCOME_READ_LIMIT) {
			truncated = true;
			return;
		}
		chunks.push(buffer);
		size += buffer.length;
	};

	const write = res.write;
	const end = res.end;
	res.write = function (
		this: ServerResponse,
		chunk: unknown,
		...rest: unknown[]
	) {
		keep(chunk, rest[0]);
		return write.apply(this, [chunk, ...rest] as Parameters<typeof write>);
	} as typeof res.write;
	res.end = function (
		this: ServerResponse,
		chunk?: unknown,
		...rest: unknown[]
	) {
		keep(chunk, rest[0]);
		return end.apply(this, [chunk, ...rest] as Parameters<typeof end>);
	} as typeof res.end;

	return () => (truncated ? undefined : Buffer.concat(chunks).toString("utf8"));
}
