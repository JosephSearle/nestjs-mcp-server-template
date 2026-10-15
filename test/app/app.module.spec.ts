import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app/app.module";
import { ExamplePrompts } from "../../src/app/prompts/example.prompts";
import { ExampleResources } from "../../src/app/resources/example.resources";
import { ExampleTools } from "../../src/app/tools/example.tools";
import { PlatformModule } from "../../src/platform/platform.module";

describe("AppModule", () => {
	it("compiles, imports PlatformModule and registers the examples", async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		expect(moduleRef.get(PlatformModule)).toBeInstanceOf(PlatformModule);
		expect(moduleRef.get(ExampleTools)).toBeInstanceOf(ExampleTools);
		expect(moduleRef.get(ExampleResources)).toBeInstanceOf(ExampleResources);
		expect(moduleRef.get(ExamplePrompts)).toBeInstanceOf(ExamplePrompts);
		await moduleRef.close();
	});
});
