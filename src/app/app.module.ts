import { Module } from "@nestjs/common";
import { PlatformModule } from "../platform/platform.module";
import { ExamplePrompts } from "./prompts/example.prompts";
import { ExampleResources } from "./resources/example.resources";
import { ExampleTools } from "./tools/example.tools";

// The one seam between template and engineer code: register your MCP controllers here.
@Module({
	imports: [PlatformModule],
	controllers: [ExampleTools, ExampleResources, ExamplePrompts],
})
export class AppModule {}
