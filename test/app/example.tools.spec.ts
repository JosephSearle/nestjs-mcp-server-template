import { ExampleTools } from "../../src/app/tools/example.tools";

describe("ExampleTools", () => {
	it("echoes the message", () => {
		expect(new ExampleTools().echo({ message: "hello" })).toEqual({
			content: [{ type: "text", text: "hello" }],
		});
	});
});
