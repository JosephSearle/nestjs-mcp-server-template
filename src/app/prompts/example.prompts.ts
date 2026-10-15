import { Payload } from "@nestjs/microservices";
import { McpController, Prompt } from "@rekog/mcp-nest";
import { z } from "zod";

const summariseParameters = z
	.object({
		text: z.string().min(1).describe("The text to summarise."),
	})
	.strict();

@McpController()
export class ExamplePrompts {
	@Prompt({
		name: "summarise",
		description: "Asks the model for a short summary of some text.",
		parameters: summariseParameters,
	})
	summarise(@Payload() { text }: z.infer<typeof summariseParameters>) {
		return {
			messages: [
				{
					role: "user" as const,
					content: {
						type: "text" as const,
						text: `Summarise the following text in three sentences or fewer.\n\n${text}`,
					},
				},
			],
		};
	}
}
