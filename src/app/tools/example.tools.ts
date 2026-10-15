import { Payload } from "@nestjs/microservices";
import { McpController, Tool } from "@rekog/mcp-nest";
import { z } from "zod";

// .strict() rejects arguments the schema doesn't name, so callers can't smuggle in extra fields.
const echoParameters = z
	.object({
		message: z.string().min(1).max(1000).describe("The text to echo back."),
	})
	.strict();

@McpController()
export class ExampleTools {
	@Tool({
		name: "echo",
		description: "Returns the message it was given.",
		parameters: echoParameters,
		annotations: { readOnlyHint: true, openWorldHint: false },
	})
	echo(@Payload() { message }: z.infer<typeof echoParameters>) {
		return { content: [{ type: "text" as const, text: message }] };
	}
}
