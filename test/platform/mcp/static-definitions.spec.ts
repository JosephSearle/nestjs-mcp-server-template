import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// Spec §2 and §5: no in-process session state and no tools, resources or prompts defined at
// runtime. Tool definitions are static code, reviewed through PRs.
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
	{
		pattern: /\bstatefulMode\s*:/,
		why: "statefulMode keeps sessions in process. The server must stay stateless.",
	},
	{
		pattern: /\bserverMutator\s*:/,
		why: "serverMutator can change the server's definitions at runtime.",
	},
	{
		pattern: /\.register(Tool|Resource|Prompt)\s*\(/,
		why: "Register tools, resources and prompts with decorators on an @McpController instead.",
	},
	{
		pattern: /\bMCP_STRATEGY\b/,
		why: "Injecting the strategy is only needed for dynamic registration.",
	},
];

function sourceFiles(dir: string): string[] {
	return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			return sourceFiles(path);
		}
		return path.endsWith(".ts") ? [path] : [];
	});
}

describe("MCP definitions", () => {
	it("are static, with no session state", () => {
		const violations: string[] = [];
		for (const file of sourceFiles("src")) {
			readFileSync(file, "utf8")
				.split("\n")
				.forEach((line, index) => {
					if (/^\s*(\/\/|\*)/.test(line)) {
						return;
					}
					for (const { pattern, why } of FORBIDDEN) {
						if (pattern.test(line)) {
							violations.push(`${relative(".", file)}:${index + 1}: ${why}`);
						}
					}
				});
		}

		expect(violations).toEqual([]);
	});
});
