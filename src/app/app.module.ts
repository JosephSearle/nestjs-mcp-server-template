import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";

// The one seam between template and engineer code: register your MCP controllers here.
@Module({
	imports: [PlatformModule],
})
export class AppModule {}
