import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app/app.module";
import { startHttp } from "./platform/mcp/start-mcp";

startHttp(AppModule).catch((error: unknown) => {
	new Logger("Bootstrap").error(error);
	process.exit(1);
});
