import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app/app.module";

async function bootstrap(): Promise<void> {
	const app = await NestFactory.create(AppModule);
	await app.listen(process.env.PORT ?? 3000);
}

bootstrap().catch((error: unknown) => {
	new Logger("Bootstrap").error(error);
	process.exit(1);
});
