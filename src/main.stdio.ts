// Must stay the first import: it stops the process before config loads when NODE_ENV=production.
import "./platform/config/stdio-entry-guard";
import "reflect-metadata";
import { AppModule } from "./app/app.module";
import { startStdio } from "./platform/mcp/start-mcp";

// Local development and tests only. The container runs main.js, never this file.
startStdio(AppModule).catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.stack : String(error)}\n`,
	);
	process.exit(1);
});
