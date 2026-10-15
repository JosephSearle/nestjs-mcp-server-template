import { Test } from "@nestjs/testing";
import { PlatformModule } from "../../src/platform/platform.module";

describe("PlatformModule", () => {
	it("compiles on its own", async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [PlatformModule],
		}).compile();

		expect(moduleRef.get(PlatformModule)).toBeInstanceOf(PlatformModule);
		await moduleRef.close();
	});
});
