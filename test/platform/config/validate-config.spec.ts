import { readFileSync } from "node:fs";
import {
	formatProblems,
	httpEntryProblems,
	parseConfig,
	validateConfig,
} from "../../../src/platform/config/validate-config";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const SECRET = "s".repeat(32);
const PRODUCTION = {
	NODE_ENV: "production",
	MCP_PUBLIC_URL: "https://mcp.example.com",
	MCP_REQUEST_STATE_SECRET: SECRET,
	LOG_PSEUDONYM_KEY: SECRET,
	AUTH_ISSUER: "https://issuer.example.com/",
};
const LINE = /^[A-Z][A-Z0-9_]*: .+\. .+\.$/;

function problemsFor(env: Record<string, string>): string[] {
	const result = parseConfig(env);
	if (result.ok) {
		throw new Error("Expected invalid config.");
	}
	return result.problems;
}

function configFor(env: Record<string, string>) {
	const result = parseConfig(env);
	if (!result.ok) {
		throw new Error(`Expected valid config:\n${result.problems.join("\n")}`);
	}
	return result.config;
}

describe("parseConfig", () => {
	it("fills every default from an empty environment", () => {
		const config = configFor({});

		expect(config).toMatchObject({
			NODE_ENV: "development",
			PORT: 3000,
			MCP_SERVER_NAME: pkg.name,
			MCP_SERVER_VERSION: pkg.version,
			MCP_PUBLIC_URL: "http://localhost:3000",
			MCP_MAX_REQUEST_BYTES: 1048576,
			MCP_REQUEST_TIMEOUT_MS: 60000,
			MCP_INPUT_MAX_ROUNDS: 5,
			MCP_INPUT_ROUND_TIMEOUT_MS: 300000,
			AUTH_MODE: "external",
			AUTH_PROVIDER: "generic",
			AUTH_AUDIENCE: "http://localhost:3000/mcp",
			AUTH_ALGORITHMS: ["RS256"],
			AUTH_CLOCK_TOLERANCE_SECONDS: 30,
			AUTH_MAX_TOKEN_LIFETIME_SECONDS: 5400,
			DEV_AUTH_PROVIDER: "github",
			LOG_LEVEL: "info",
			TRUST_PROXY_HOPS: 0,
			SHUTDOWN_TIMEOUT_MS: 25000,
		});
		expect(config.MCP_REQUEST_STATE_SECRET.length).toBeGreaterThanOrEqual(32);
		expect(config.LOG_PSEUDONYM_KEY.length).toBeGreaterThanOrEqual(32);
		expect(config.DEV_AUTH_JWT_SECRET.length).toBeGreaterThanOrEqual(32);
		expect(config.AUTH_ISSUER).toBeUndefined();
		expect(config.REDIS_URL).toBeUndefined();
	});

	it("treats empty variables as unset", () => {
		expect(configFor({ PORT: "", AUTH_MODE: "" })).toMatchObject({
			PORT: 3000,
			AUTH_MODE: "external",
		});
	});

	it("parses numbers, lists and derived values", () => {
		const config = configFor({
			PORT: "8080",
			MCP_PUBLIC_URL: "https://mcp.example.com/",
			MCP_ALLOWED_ORIGINS: "https://a.example.com, https://b.example.com",
			AUTH_ALGORITHMS: "RS256,ES256",
		});

		expect(config.PORT).toBe(8080);
		expect(config.MCP_PUBLIC_URL).toBe("https://mcp.example.com");
		expect(config.AUTH_AUDIENCE).toBe("https://mcp.example.com/mcp");
		expect(config.MCP_ALLOWED_ORIGINS).toEqual([
			"https://a.example.com",
			"https://b.example.com",
		]);
		expect(config.AUTH_ALGORITHMS).toEqual(["RS256", "ES256"]);
	});

	it("accepts a complete production config", () => {
		expect(configFor(PRODUCTION).NODE_ENV).toBe("production");
	});

	it.each([
		["MCP_PUBLIC_URL"],
		["MCP_REQUEST_STATE_SECRET"],
		["LOG_PSEUDONYM_KEY"],
		["AUTH_ISSUER"],
	])("requires %s in production", (key) => {
		const env: Record<string, string> = { ...PRODUCTION };
		delete env[key];

		const problems = problemsFor(env);

		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(new RegExp(`^${key}: required when `));
	});

	it("does not require AUTH_ISSUER in production with AUTH_MODE=dev, but refuses dev mode", () => {
		const { AUTH_ISSUER: _, ...env } = PRODUCTION;

		const problems = problemsFor({
			...env,
			AUTH_MODE: "dev",
			DEV_AUTH_CLIENT_ID: "id",
			DEV_AUTH_CLIENT_SECRET: "secret",
		});

		expect(problems).toEqual([
			"AUTH_MODE: dev is not allowed when NODE_ENV=production. Set AUTH_MODE=external.",
			expect.stringMatching(/^MCP_PUBLIC_URL: must be a localhost URL/),
		]);
	});

	it("requires the OAuth app and a localhost URL in dev mode", () => {
		const problems = problemsFor({
			AUTH_MODE: "dev",
			MCP_PUBLIC_URL: "https://mcp.example.com",
		});

		expect(problems.map((p) => p.split(":")[0])).toEqual([
			"DEV_AUTH_CLIENT_ID",
			"DEV_AUTH_CLIENT_SECRET",
			"MCP_PUBLIC_URL",
		]);
		expect(
			configFor({
				AUTH_MODE: "dev",
				DEV_AUTH_CLIENT_ID: "id",
				DEV_AUTH_CLIENT_SECRET: "secret",
			}).AUTH_MODE,
		).toBe("dev");
	});

	it.each([
		["PORT", "abc"],
		["PORT", "70000"],
		["NODE_ENV", "staging"],
		["MCP_PUBLIC_URL", "not a url"],
		["AUTH_ISSUER", "ftp://issuer.example.com"],
		["AUTH_ALGORITHMS", "none,HS256"],
		["MCP_REQUEST_STATE_SECRET", "too-short"],
		["REDIS_URL", "http://redis.example.com"],
	])("rejects %s=%s", (key, value) => {
		const problems = problemsFor({ [key]: value });

		expect(problems).toHaveLength(1);
		expect(problems[0].startsWith(`${key}: `)).toBe(true);
	});

	it("reports every problem in one pass", () => {
		const problems = problemsFor({
			NODE_ENV: "production",
			PORT: "abc",
			LOG_LEVEL: "loud",
		});

		expect(problems.map((p) => p.split(":")[0]).sort()).toEqual([
			"AUTH_ISSUER",
			"LOG_LEVEL",
			"LOG_PSEUDONYM_KEY",
			"MCP_PUBLIC_URL",
			"MCP_REQUEST_STATE_SECRET",
			"PORT",
		]);
	});

	it("formats each problem as `<KEY>: <what's wrong>. <what to do>.` and never prints a value", () => {
		const leaked = "hunter2-very-secret-value";
		const problems = problemsFor({
			NODE_ENV: "production",
			PORT: leaked,
			MCP_REQUEST_STATE_SECRET: leaked,
			AUTH_ALGORITHMS: `HS256,${leaked}`,
			MCP_PUBLIC_URL: leaked,
		});
		const output = formatProblems(problems);

		for (const problem of problems) {
			expect(problem).toMatch(LINE);
		}
		expect(output.split("\n")[0]).toBe("Invalid configuration:");
		expect(output).not.toContain(leaked);
	});
});

describe("httpEntryProblems", () => {
	it("requires AUTH_ISSUER with AUTH_MODE=external", () => {
		const problems = httpEntryProblems({
			AUTH_MODE: "external",
			AUTH_ISSUER: undefined,
		});

		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(LINE);
		expect(problems[0]).toMatch(/^AUTH_ISSUER: /);
	});

	it("passes with an issuer, or with AUTH_MODE=dev", () => {
		expect(
			httpEntryProblems({
				AUTH_MODE: "external",
				AUTH_ISSUER: "https://issuer.example.com/",
			}),
		).toEqual([]);
		expect(
			httpEntryProblems({ AUTH_MODE: "dev", AUTH_ISSUER: undefined }),
		).toEqual([]);
	});
});

describe("validateConfig", () => {
	const exit = process.exit;
	const write = process.stderr.write;
	let exitCode: number | undefined;
	let stderr: string;

	beforeEach(() => {
		exitCode = undefined;
		stderr = "";
		process.exit = ((code?: number) => {
			exitCode = code;
			throw new Error("process.exit");
		}) as typeof process.exit;
		process.stderr.write = ((chunk: string) => {
			stderr += chunk;
			return true;
		}) as typeof process.stderr.write;
	});

	afterEach(() => {
		process.exit = exit;
		process.stderr.write = write;
	});

	it("returns the config when it is valid", () => {
		expect(validateConfig({ PORT: "4000" }).PORT).toBe(4000);
		expect(exitCode).toBeUndefined();
	});

	it("prints the problems and exits 1 when it is invalid", () => {
		expect(() => validateConfig({ PORT: "abc" })).toThrow("process.exit");
		expect(exitCode).toBe(1);
		expect(stderr).toMatch(/^Invalid configuration:\n {2}PORT: /);
		expect(stderr).not.toContain("abc");
	});
});
