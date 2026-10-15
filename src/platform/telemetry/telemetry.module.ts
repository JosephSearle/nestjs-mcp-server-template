import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { LoggerModule } from "nestjs-pino";
import type { AppConfig } from "../config/config.schema";
import { logDestination } from "./log-destination";
import { pinoParams } from "./log-options";
import { McpTelemetryInterceptor } from "./mcp-telemetry.interceptor";
import { Pseudonymiser } from "./pseudonym";

/**
 * JSON logs through nestjs-pino, MCP spans and metrics, and pseudonyms (spec §7, ADR-0005). The
 * OpenTelemetry SDK itself starts before Nest, from `instrumentation.ts`.
 */
@Module({
	imports: [
		LoggerModule.forRootAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService<AppConfig, true>) =>
				pinoParams(
					{
						level: config.get("LOG_LEVEL", { infer: true }),
						pseudonymKey: config.get("LOG_PSEUDONYM_KEY", { infer: true }),
					},
					logDestination(),
				),
		}),
	],
	providers: [
		Pseudonymiser,
		{ provide: APP_INTERCEPTOR, useClass: McpTelemetryInterceptor },
	],
	exports: [Pseudonymiser],
})
export class TelemetryModule {}
