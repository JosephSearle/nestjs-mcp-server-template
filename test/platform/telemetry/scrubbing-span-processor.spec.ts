import {
	BasicTracerProvider,
	InMemorySpanExporter,
	SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
	SCRUBBED_ATTRIBUTES,
	ScrubbingSpanProcessor,
} from "../../../src/platform/telemetry/scrubbing-span-processor";

describe("ScrubbingSpanProcessor", () => {
	it("removes client address and raw identity before export", () => {
		const exporter = new InMemorySpanExporter();
		const tracer = new BasicTracerProvider({
			spanProcessors: [
				new ScrubbingSpanProcessor(new SimpleSpanProcessor(exporter)),
			],
		}).getTracer("test");

		const span = tracer.startSpan("POST /mcp", {
			attributes: Object.fromEntries(
				SCRUBBED_ATTRIBUTES.map((key) => [key, "personal"]),
			),
		});
		span.setAttribute("http.request.method", "POST");
		span.setAttribute("enduser.pseudo.id", "abc");
		span.end();

		const [exported] = exporter.getFinishedSpans();
		expect(exported.attributes).toEqual({
			"http.request.method": "POST",
			"enduser.pseudo.id": "abc",
		});
		expect(SCRUBBED_ATTRIBUTES).toContain("client.address");
	});
});
