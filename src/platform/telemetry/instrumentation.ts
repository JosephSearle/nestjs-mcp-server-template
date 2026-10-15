// Loaded with `node --import ./dist/platform/telemetry/instrumentation.js`, so the SDK patches
// http and express before Nest imports them (spec §7, ADR-0005).
import { register } from "node:module";
import { pathToFileURL } from "node:url";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { NoopSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { processTelemetrySettings } from "../config/telemetry-env";
import { exitOnProblems } from "../config/validate-config";
import { otlpExporters, telemetryInstrumentations } from "./sdk-parts";

// Nest 12 is ESM, so express and http arrive through `import`. This hook lets the
// instrumentations patch them; `require` is already covered.
register("@opentelemetry/instrumentation/hook.mjs", pathToFileURL(__filename));

const result = processTelemetrySettings();
if (!result.ok) {
	exitOnProblems(result.problems);
} else {
	const { settings } = result;
	const sdk = new NodeSDK({
		resource: resourceFromAttributes({ ...settings.resource }),
		instrumentations: telemetryInstrumentations(),
		// Logs go to stdout through pino, never through the SDK. Without this the SDK would
		// start an OTLP log exporter by default.
		logRecordProcessors: [],
		// With no endpoint nothing is exported (spec §7). Every option is given explicitly: a
		// missing one makes the SDK fall back to an OTLP exporter on localhost. The no-op span
		// processor keeps the tracer provider, which the SDK skips for an empty list, so logs
		// still carry trace_id and span_id.
		...(settings.exporter === "otlp"
			? otlpExporters(settings.protocol)
			: { spanProcessors: [new NoopSpanProcessor()], metricReaders: [] }),
	});
	sdk.start();

	// Flushes what is buffered on SIGTERM. #16 orders this after the HTTP drain.
	process.once("SIGTERM", () => {
		sdk.shutdown().catch(() => undefined);
	});
}
