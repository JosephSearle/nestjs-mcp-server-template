import { Module } from "@nestjs/common";
import { McpController, Tool, ToolScopes } from "@rekog/mcp-nest";
import { ExampleTools } from "../../../../src/app/tools/example.tools";
import { PlatformModule } from "../../../../src/platform/platform.module";

export const REPORTS_SCOPE = "reports:read";

/** A tool that needs a scope beyond the base one, to exercise step-up. */
@McpController()
class ReportTools {
	@Tool({ name: "report", description: "Needs reports:read." })
	@ToolScopes([REPORTS_SCOPE])
	report() {
		return { content: [{ type: "text" as const, text: "report" }] };
	}
}

@Module({
	imports: [PlatformModule.forRoot({ scopes: ["mcp:access", REPORTS_SCOPE] })],
	controllers: [ExampleTools, ReportTools],
})
export class ScopedModule {}
