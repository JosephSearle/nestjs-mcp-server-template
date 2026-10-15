import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app/app.module";
import type { AppConfig } from "./platform/config/config.schema";
import {
	exitOnProblems,
	httpEntryProblems,
} from "./platform/config/validate-config";

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
	exitOnProblems(
		httpEntryProblems({
			AUTH_MODE: config.get("AUTH_MODE", { infer: true }),
			AUTH_ISSUER: config.get("AUTH_ISSUER", { infer: true }),
		}),
	);
	await app.listen(config.get("PORT", { infer: true }));
}

bootstrap().catch((error: unknown) => {
	new Logger("Bootstrap").error(error);
	process.exit(1);
});
