import type {
	INestApplication,
	NestApplicationOptions,
	Type,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import {
	McpStrategy,
	StdioTransport,
	type StreamableHttpTransport,
} from "@rekog/mcp-nest";
import { Logger } from "nestjs-pino";
import type { AppConfig } from "../config/config.schema";
import {
	exitOnProblems,
	httpEntryProblems,
	stdioEntryProblems,
} from "../config/validate-config";
import { logToStderr } from "../telemetry/log-destination";
import { applyHttpLimits } from "./http-limits";
import { strategyOptions } from "./mcp.options";
import { MCP_HTTP_TRANSPORT } from "./mcp.tokens";

const configOf = (app: INestApplication) =>
	app.get<ConfigService<AppConfig, true>>(ConfigService);

function strategyConfig(config: ConfigService<AppConfig, true>) {
	return {
		MCP_SERVER_NAME: config.get("MCP_SERVER_NAME", { infer: true }),
		MCP_SERVER_VERSION: config.get("MCP_SERVER_VERSION", { infer: true }),
		MCP_REQUEST_STATE_SECRET: config.get("MCP_REQUEST_STATE_SECRET", {
			infer: true,
		}),
		MCP_INPUT_MAX_ROUNDS: config.get("MCP_INPUT_MAX_ROUNDS", { infer: true }),
		MCP_INPUT_ROUND_TIMEOUT_MS: config.get("MCP_INPUT_ROUND_TIMEOUT_MS", {
			infer: true,
		}),
	};
}

/**
 * Builds the HTTP app with MCP mounted on /mcp, ready to `listen()`. Separate from `startHttp` so
 * tests can listen on a free port.
 */
export async function createHttpApp(
	appModule: Type,
	options: Pick<NestApplicationOptions, "logger"> = {},
): Promise<NestExpressApplication> {
	const app = await NestFactory.create<NestExpressApplication>(appModule, {
		bufferLogs: true,
		...options,
		bodyParser: false,
	});
	// Tests pass their own logger; everything else logs JSON through pino.
	if (options.logger === undefined) {
		app.useLogger(app.get(Logger));
	}
	const config = configOf(app);
	exitOnProblems(
		httpEntryProblems({
			AUTH_MODE: config.get("AUTH_MODE", { infer: true }),
			AUTH_ISSUER: config.get("AUTH_ISSUER", { infer: true }),
		}),
	);
	applyHttpLimits(app, {
		MCP_MAX_REQUEST_BYTES: config.get("MCP_MAX_REQUEST_BYTES", {
			infer: true,
		}),
		MCP_REQUEST_TIMEOUT_MS: config.get("MCP_REQUEST_TIMEOUT_MS", {
			infer: true,
		}),
	});

	const transport = app.get<StreamableHttpTransport>(MCP_HTTP_TRANSPORT);
	const strategy = new McpStrategy(
		strategyOptions(strategyConfig(config), [transport]),
	);
	strategy.setHttpAdapter(app.getHttpAdapter());
	app.connectMicroservice({ strategy }, { inheritAppConfig: true });
	// Before listen(), so the MCP handlers are ready before connections arrive.
	await app.startAllMicroservices();
	return app;
}

/** The HTTP entry: Streamable HTTP on /mcp, modern revision only. */
export async function startHttp(appModule: Type): Promise<void> {
	const app = await createHttpApp(appModule);
	await app.listen(configOf(app).get("PORT", { infer: true }));
}

/**
 * The stdio entry, for local development and tests only. Logs go to stderr, it opens no port, and
 * it refuses to start when NODE_ENV=production.
 */
export async function startStdio(appModule: Type): Promise<void> {
	logToStderr();
	const app = await NestFactory.create(appModule, {
		bufferLogs: true,
		bodyParser: false,
	});
	app.useLogger(app.get(Logger));
	const config = configOf(app);
	exitOnProblems(
		stdioEntryProblems({ NODE_ENV: config.get("NODE_ENV", { infer: true }) }),
	);

	const strategy = new McpStrategy(
		strategyOptions(strategyConfig(config), [
			new StdioTransport({ legacy: "reject" }),
		]),
	);
	app.connectMicroservice({ strategy }, { inheritAppConfig: true });
	await app.init();
	await app.startAllMicroservices();
}
