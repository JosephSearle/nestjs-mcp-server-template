import { type DynamicModule, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { SUPPORTED_SCOPES } from "./auth/auth.tokens";
import { ProtectedResourceController } from "./auth/protected-resource.controller";
import { validateConfig } from "./config/validate-config";
import { McpPlatformModule } from "./mcp/mcp.module";
import { TelemetryModule } from "./telemetry/telemetry.module";

export interface PlatformOptions {
	/** Every scope the server defines, published as `scopes_supported` (spec §3). */
	scopes: readonly string[];
}

@Module({})
// biome-ignore lint/complexity/noStaticOnlyClass: a Nest dynamic module is a class with forRoot.
export class PlatformModule {
	/** Imported once, by `src/app/app.module.ts`, which passes in the engineer's scope names. */
	static forRoot(options: PlatformOptions): DynamicModule {
		return {
			module: PlatformModule,
			imports: [
				// Inject the result as `ConfigService<AppConfig, true>`.
				ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
				TelemetryModule,
				AuthModule,
				McpPlatformModule,
			],
			controllers: [ProtectedResourceController],
			providers: [{ provide: SUPPORTED_SCOPES, useValue: options.scopes }],
		};
	}
}
