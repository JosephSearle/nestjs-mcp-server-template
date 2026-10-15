import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateConfig } from "./config/validate-config";
import { McpPlatformModule } from "./mcp/mcp.module";
import { TelemetryModule } from "./telemetry/telemetry.module";

@Module({
	imports: [
		// Inject the result as `ConfigService<AppConfig, true>`.
		ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
		TelemetryModule,
		McpPlatformModule,
	],
})
export class PlatformModule {}
