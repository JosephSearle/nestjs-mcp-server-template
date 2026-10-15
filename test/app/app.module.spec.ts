import { Test } from "@nestjs/testing";
import { AppModule } from "../../src/app/app.module";
import { PlatformModule } from "../../src/platform/platform.module";

describe("AppModule", () => {
	it("compiles and imports PlatformModule", async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		expect(moduleRef.get(PlatformModule)).toBeInstanceOf(PlatformModule);
		await moduleRef.close();
	});
});
