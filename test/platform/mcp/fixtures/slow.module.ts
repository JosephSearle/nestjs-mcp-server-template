import { setTimeout as sleep } from "node:timers/promises";
import { Module } from "@nestjs/common";
import { McpController, Tool } from "@rekog/mcp-nest";
import { PlatformModule } from "../../../../src/platform/platform.module";

/** Takes longer than the test's MCP_REQUEST_TIMEOUT_MS, to exercise the deadline. */
@McpController()
class SlowTools {
	@Tool({ name: "slow", description: "Answers after one second." })
	async slow() {
		// Unref so the timer never holds the test process open.
		await sleep(1000, undefined, { ref: false });
		return { content: [{ type: "text" as const, text: "done" }] };
	}
}

@Module({
	imports: [PlatformModule.forRoot({ scopes: [] })],
	controllers: [SlowTools],
})
export class SlowModule {}
