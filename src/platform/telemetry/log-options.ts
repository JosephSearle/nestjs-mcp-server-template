import type { IncomingMessage } from "node:http";
import { isSpanContextValid, trace } from "@opentelemetry/api";
import type { Params } from "nestjs-pino";
import pino, { type DestinationStream, type LoggerOptions } from "pino";
import type { Options } from "pino-http";
import { pseudoIdAttributes } from "./pseudonym";

export const REDACTED = "[Redacted]";

/** Fixed paths redacted by pino (spec §7). */
export const REDACT_PATHS = [
	"req.headers.authorization",
	"req.headers.cookie",
	'res.headers["set-cookie"]',
];

// Pino paths can't match part of a key, so any key containing token or secret, and any
// requestState, is redacted by walking each finished line.
const SENSITIVE_KEY = /token|secret|^requeststate$/i;
// A line that can't hold such a key is written as is, without parsing.
const MAY_BE_SENSITIVE = /token|secret|requeststate/i;

function redactKeys(value: unknown): unknown {
	if (value === null || typeof value !== "object") {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(redactKeys);
	}
	return Object.fromEntries(
		Object.entries(value).map(([key, entry]) => [
			key,
			SENSITIVE_KEY.test(key) ? REDACTED : redactKeys(entry),
		]),
	);
}

/**
 * Redacts sensitive keys in a finished JSON line. Runs on the line rather than the log object
 * because pino doesn't format child-logger bindings, which is where pino-http puts `req`.
 */
export function redactLine(line: string): string {
	if (!MAY_BE_SENSITIVE.test(line)) {
		return line;
	}
	try {
		return `${JSON.stringify(redactKeys(JSON.parse(line)))}\n`;
	} catch {
		return line;
	}
}

/** Adds the active span's IDs, so every line can be joined to its trace. */
function traceFields(): { trace_id?: string; span_id?: string } {
	const span = trace.getActiveSpan()?.spanContext();
	return span && isSpanContextValid(span)
		? { trace_id: span.traceId, span_id: span.spanId }
		: {};
}

// The request without its remote address and port: client IP is dropped by default (spec §7).
function serializeRequest(req: {
	id?: unknown;
	method?: string;
	url?: string;
	headers?: unknown;
}) {
	return { id: req.id, method: req.method, url: req.url, headers: req.headers };
}

// The MCP handler writes the response itself, so the standard serializer, which checks
// `headersSent`, reports a null status and no headers. Read them from the raw response.
function serializeResponse(res: {
	statusCode?: number | null;
	headers?: unknown;
	raw?: { statusCode?: number; getHeaders?: () => unknown };
}) {
	return {
		statusCode: res.raw?.statusCode ?? res.statusCode,
		headers: res.raw?.getHeaders?.() ?? res.headers,
	};
}

export interface LogSettings {
	level: LoggerOptions["level"];
	pseudonymKey: string;
}

/** Pino options shared by the HTTP request logger and the app logger. */
export function loggerOptions({
	level,
}: Pick<LogSettings, "level">): LoggerOptions {
	return {
		level,
		messageKey: "message",
		base: undefined,
		timestamp: pino.stdTimeFunctions.isoTime,
		formatters: {
			level: (label) => ({ level: label }),
		},
		hooks: { streamWrite: redactLine },
		mixin: traceFields,
		redact: { paths: REDACT_PATHS, censor: REDACTED },
	};
}

/** pino-http options. Tool arguments and results are not logged: bodies never are. */
export function httpLoggerOptions(settings: LogSettings): Options {
	return {
		...loggerOptions(settings),
		serializers: { req: serializeRequest, res: serializeResponse },
		customProps: (req: IncomingMessage & { user?: unknown }) =>
			pseudoIdAttributes(req.user, settings.pseudonymKey),
	};
}

/** nestjs-pino parameters. Logs go to stdout, or to `destination` (stderr under stdio). */
export function pinoParams(
	settings: LogSettings,
	destination?: DestinationStream,
): Params {
	const options = httpLoggerOptions(settings);
	return { pinoHttp: destination ? [options, destination] : options };
}
