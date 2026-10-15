import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { envSchema } from "../../../src/platform/config/config.schema";
import { SCRUBBED_ATTRIBUTES } from "../../../src/platform/telemetry/scrubbing-span-processor";

// Spec §7 and NFR-4: identity reaches telemetry only as enduser.pseudo.id. Raw sub, email, name,
// tokens and client.address are never recorded, and no setting turns them on (concern 4).
const FORBIDDEN: { pattern: RegExp; why: string }[] = [
	{
		pattern: /["'](enduser\.id|user\.(id|email|name|full_name))["']\s*[\]:,]/,
		why: "Record identity only as enduser.pseudo.id, through Pseudonymiser.",
	},
	{
		pattern: /["']client\.address["']\s*:/,
		why: "Client IP is dropped. Don't set client.address.",
	},
	{
		pattern: /setAttributes?\([^)]*\b(sub|email|token)\b/,
		why: "Don't put a raw sub, email or token on a span.",
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

describe("Telemetry identity", () => {
	it("is never recorded raw in src/", () => {
		const scrubber = join(
			"src",
			"platform",
			"telemetry",
			"scrubbing-span-processor.ts",
		);
		const violations: string[] = [];
		for (const file of sourceFiles("src")) {
			// The scrubber lists these attributes to remove them.
			if (file === scrubber) {
				continue;
			}
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

	it("has no setting to record it", () => {
		const settings = Object.keys(envSchema.shape).filter((key) =>
			/LOG_(RAW|USER|SUB|EMAIL|IP)|RECORD|CLIENT_ADDRESS/.test(key),
		);
		expect(settings).toEqual([]);
	});

	it("scrubs client.address and enduser.id from spans", () => {
		expect(SCRUBBED_ATTRIBUTES).toEqual(
			expect.arrayContaining(["client.address", "enduser.id"]),
		);
	});
});
