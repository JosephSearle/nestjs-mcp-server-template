import { ProtocolError, ProtocolErrorCode } from "@modelcontextprotocol/server";
import { Module } from "@nestjs/common";
import { McpController, Tool } from "@rekog/mcp-nest";
import { ExamplePrompts } from "../../../../src/app/prompts/example.prompts";
import { ExampleResources } from "../../../../src/app/resources/example.resources";
import { ExampleTools } from "../../../../src/app/tools/example.tools";
import { PlatformModule } from "../../../../src/platform/platform.module";

/** Tools that fail, to exercise error spans and error counts. */
@McpController()
class FailingTools {
	@Tool({ name: "rejects", description: "Fails with a JSON-RPC error." })
	rejects() {
		throw new ProtocolError(ProtocolErrorCode.InvalidParams, "Rejected.");
	}

	@Tool({ name: "breaks", description: "Fails with a plain error." })
	breaks() {
		throw new Error("Broken.");
	}
}

@Module({
	imports: [PlatformModule],
	controllers: [ExampleTools, ExampleResources, ExamplePrompts, FailingTools],
})
export class FailingModule {}
