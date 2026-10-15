import { context, metrics, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import {
	type DataPoint,
	MeterProvider,
	MetricReader,
} from "@opentelemetry/sdk-metrics";
import {
	BasicTracerProvider,
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";

/** A reader the test collects on demand, instead of on a timer. */
class TestMetricReader extends MetricReader {
	protected onForceFlush(): Promise<void> {
		return Promise.resolve();
	}

	protected onShutdown(): Promise<void> {
		return Promise.resolve();
	}
}

export interface TestTelemetry {
	spans: InMemorySpanExporter;
	/** Every data point of the named metric, collected now. */
	points(name: string): Promise<DataPoint<unknown>[]>;
	reset(): void;
}

/**
 * Registers in-memory tracing and metrics as the global providers, as `instrumentation.ts` does
 * with real exporters. Call it before the app is created.
 */
export function installTestTelemetry(): TestTelemetry {
	context.setGlobalContextManager(
		new AsyncLocalStorageContextManager().enable(),
	);
	propagation.setGlobalPropagator(new W3CTraceContextPropagator());

	const spans = new InMemorySpanExporter();
	trace.setGlobalTracerProvider(
		new BasicTracerProvider({
			spanProcessors: [new SimpleSpanProcessor(spans)],
		}),
	);

	const reader = new TestMetricReader();
	metrics.setGlobalMeterProvider(new MeterProvider({ readers: [reader] }));

	return {
		spans,
		async points(name) {
			const { resourceMetrics } = await reader.collect();
			return resourceMetrics.scopeMetrics
				.flatMap((scope) => scope.metrics)
				.filter((metric) => metric.descriptor.name === name)
				.flatMap((metric) => metric.dataPoints as DataPoint<unknown>[]);
		},
		reset() {
			spans.reset();
		},
	};
}
