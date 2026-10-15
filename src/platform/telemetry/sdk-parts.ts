import type { IncomingMessage } from "node:http";
import { getNumberFromEnv } from "@opentelemetry/core";
import { OTLPMetricExporter as GrpcMetricExporter } from "@opentelemetry/exporter-metrics-otlp-grpc";
import { OTLPMetricExporter as ProtoMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPTraceExporter as GrpcTraceExporter } from "@opentelemetry/exporter-trace-otlp-grpc";
import { OTLPTraceExporter as ProtoTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import type { Instrumentation } from "@opentelemetry/instrumentation";
import { ExpressInstrumentation } from "@opentelemetry/instrumentation-express";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import {
	BatchSpanProcessor,
	type SpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { OtlpProtocol } from "../config/telemetry-env";
import { ScrubbingSpanProcessor } from "./scrubbing-span-processor";

/** Health checks are probed every few seconds and are excluded from traces (spec §8). */
export const UNTRACED_PATHS = new Set(["/healthz", "/readyz"]);

/** Only http, express and ioredis (spec §7). ioredis is patched only if the app loads it. */
export function telemetryInstrumentations(): Instrumentation[] {
	return [
		new HttpInstrumentation({
			ignoreIncomingRequestHook: (req: IncomingMessage) =>
				UNTRACED_PATHS.has((req.url ?? "").split("?")[0]),
		}),
		new ExpressInstrumentation(),
		new IORedisInstrumentation(),
	];
}

/**
 * Vendor-neutral OTLP exporters for the chosen protocol. Each exporter reads the endpoint,
 * headers and per-signal overrides from the standard OTEL_EXPORTER_OTLP_* variables.
 */
export function otlpExporters(protocol: OtlpProtocol): {
	spanProcessors: SpanProcessor[];
	metricReaders: PeriodicExportingMetricReader[];
} {
	const grpc = protocol === "grpc";
	const traceExporter = grpc
		? new GrpcTraceExporter()
		: new ProtoTraceExporter();
	const metricExporter = grpc
		? new GrpcMetricExporter()
		: new ProtoMetricExporter();
	// The SDK reads these standard variables only for readers it builds itself. Like the SDK, the
	// timeout is capped at the interval, which the reader requires.
	const interval = getNumberFromEnv("OTEL_METRIC_EXPORT_INTERVAL") ?? 60000;
	const timeout = Math.min(
		getNumberFromEnv("OTEL_METRIC_EXPORT_TIMEOUT") ?? 30000,
		interval,
	);
	return {
		spanProcessors: [
			new ScrubbingSpanProcessor(new BatchSpanProcessor(traceExporter)),
		],
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: metricExporter,
				exportIntervalMillis: interval,
				exportTimeoutMillis: timeout,
			}),
		],
	};
}
