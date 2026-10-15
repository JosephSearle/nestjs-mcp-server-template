import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

// Spec §3: the server never forwards its inbound token. Only the guard reads Authorization, and
// the logger names it only to redact it. Calling another API takes a token audienced to it
// (on-behalf-of or the server's own identity), never this one.
const ALLOWED = [
	join("src", "platform", "auth") + sep,
	join("src", "platform", "telemetry", "log-options.ts"),
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

describe("Inbound tokens", () => {
	it("are read only by the token guard", () => {
		const readers = sourceFiles("src")
			.filter((file) => !ALLOWED.some((allowed) => file.startsWith(allowed)))
			// `.authorization`, `"authorization"` or `["Authorization"]`: any read of the header.
			.filter((file) =>
				/["'.]authorization\b/i.test(readFileSync(file, "utf8")),
			)
			.map((file) => relative(".", file));

		expect(readers).toEqual([]);
	});

	it("are not kept on the request", () => {
		const guard = readFileSync(
			join("src", "platform", "auth", "mcp-token.guard.ts"),
			"utf8",
		);
		expect(guard).not.toMatch(/req\.\w+\s*=\s*token\b/);
	});
});
