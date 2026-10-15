import { ExamplePrompts } from "../../src/app/prompts/example.prompts";

describe("ExamplePrompts", () => {
	it("asks for a summary of the text", () => {
		const { messages } = new ExamplePrompts().summarise({ text: "Some text." });

		expect(messages).toHaveLength(1);
		expect(messages[0].role).toBe("user");
		expect(messages[0].content.text).toContain("Some text.");
	});
});
