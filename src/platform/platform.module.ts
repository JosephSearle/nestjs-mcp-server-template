import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateConfig } from "./config/validate-config";

@Module({
	imports: [
		// Inject the result as `ConfigService<AppConfig, true>`.
		ConfigModule.forRoot({ isGlobal: true, validate: validateConfig }),
	],
})
export class PlatformModule {}
