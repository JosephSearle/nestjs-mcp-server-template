import type { Context } from "@opentelemetry/api";
import type {
	ReadableSpan,
	Span,
	SpanProcessor,
} from "@opentelemetry/sdk-trace-base";

/**
 * Attributes that identify a person or their network location. Instrumentations may set them;
 * they are removed before any span leaves the process (spec §7, NFR-4). There is no setting to
 * keep them: identity is recorded only as `enduser.pseudo.id`.
 */
export const SCRUBBED_ATTRIBUTES = [
	"client.address",
	"client.port",
	"network.peer.address",
	"network.peer.port",
	"net.peer.ip",
	"net.peer.port",
	"net.sock.peer.addr",
	"net.sock.peer.port",
	"http.client_ip",
	"enduser.id",
	"user.id",
	"user.email",
	"user.name",
	"user.full_name",
] as const;

/** Removes `SCRUBBED_ATTRIBUTES` from each span, then hands it to the wrapped processor. */
export class ScrubbingSpanProcessor implements SpanProcessor {
	constructor(private readonly next: SpanProcessor) {}

	onStart(span: Span, parentContext: Context): void {
		this.next.onStart(span, parentContext);
	}

	onEnd(span: ReadableSpan): void {
		// `attributes` is a plain object on the SDK's span. It is read-only in the type only.
		const attributes = span.attributes as Record<string, unknown>;
		for (const key of SCRUBBED_ATTRIBUTES) {
			delete attributes[key];
		}
		this.next.onEnd(span);
	}

	forceFlush(): Promise<void> {
		return this.next.forceFlush();
	}

	shutdown(): Promise<void> {
		return this.next.shutdown();
	}
}
