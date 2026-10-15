import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
	type AppConfig,
	type EnvKey,
	envSchema,
	FIELD_HELP,
	type ParsedEnv,
	SECRET_MIN_LENGTH,
} from "./config.schema";

type Env = Record<string, unknown>;

export type ConfigResult =
	| { ok: true; config: AppConfig }
	| { ok: false; problems: string[] };

const DEFAULT_PUBLIC_URL = "http://localhost:3000";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const isSet = (env: Env, key: EnvKey) =>
	env[key] !== undefined && env[key] !== "";

const problem = (key: EnvKey, message: string) => `${key}: ${message}`;

const randomSecret = () => randomBytes(SECRET_MIN_LENGTH).toString("base64url");

// Rules that span variables. They read the raw strings, so they still run when a type check fails
// and every problem is reported in one pass.
function crossFieldProblems(env: Env): string[] {
	const problems: string[] = [];
	const production = env.NODE_ENV === "production";
	const devAuth = env.AUTH_MODE === "dev";
	const externalAuth = !isSet(env, "AUTH_MODE") || env.AUTH_MODE === "external";

	if (production) {
		if (!isSet(env, "MCP_PUBLIC_URL")) {
			problems.push(
				problem(
					"MCP_PUBLIC_URL",
					"required when NODE_ENV=production. Set it to the URL clients use to reach the server, without /mcp.",
				),
			);
		}
		if (!isSet(env, "MCP_REQUEST_STATE_SECRET")) {
			problems.push(
				problem(
					"MCP_REQUEST_STATE_SECRET",
					`required when NODE_ENV=production. Set it to a random string of at least ${SECRET_MIN_LENGTH} characters, shared by every replica.`,
				),
			);
		}
		if (!isSet(env, "LOG_PSEUDONYM_KEY")) {
			problems.push(
				problem(
					"LOG_PSEUDONYM_KEY",
					`required when NODE_ENV=production. Set it to a random string of at least ${SECRET_MIN_LENGTH} characters that outlives your telemetry retention.`,
				),
			);
		}
		if (externalAuth && !isSet(env, "AUTH_ISSUER")) {
			problems.push(
				problem(
					"AUTH_ISSUER",
					"required when AUTH_MODE=external. Set it to your issuer URL.",
				),
			);
		}
		if (devAuth) {
			problems.push(
				problem(
					"AUTH_MODE",
					"dev is not allowed when NODE_ENV=production. Set AUTH_MODE=external.",
				),
			);
		}
	}

	if (devAuth) {
		if (!isSet(env, "DEV_AUTH_CLIENT_ID")) {
			problems.push(
				problem(
					"DEV_AUTH_CLIENT_ID",
					"required when AUTH_MODE=dev. Set it to your GitHub or Google OAuth app's client ID.",
				),
			);
		}
		if (!isSet(env, "DEV_AUTH_CLIENT_SECRET")) {
			problems.push(
				problem(
					"DEV_AUTH_CLIENT_SECRET",
					"required when AUTH_MODE=dev. Set it to your GitHub or Google OAuth app's client secret.",
				),
			);
		}
		if (isSet(env, "MCP_PUBLIC_URL") && !isLocalUrl(env.MCP_PUBLIC_URL)) {
			problems.push(
				problem(
					"MCP_PUBLIC_URL",
					"must be a localhost URL when AUTH_MODE=dev. Use http://localhost:<port>, or set AUTH_MODE=external.",
				),
			);
		}
	}

	return problems;
}

function isLocalUrl(value: unknown): boolean {
	if (typeof value !== "string" || !URL.canParse(value)) {
		// A malformed URL is already reported by its type check.
		return true;
	}
	return LOCAL_HOSTS.has(new URL(value).hostname);
}

function readPackageJson(): { name?: string; version?: string } {
	try {
		return JSON.parse(
			readFileSync(join(process.cwd(), "package.json"), "utf8"),
		);
	} catch {
		return {};
	}
}

function toAppConfig(
	parsed: ParsedEnv,
): { config: AppConfig } | { problems: string[] } {
	const pkg = readPackageJson();
	const name = parsed.MCP_SERVER_NAME ?? pkg.name;
	const version = parsed.MCP_SERVER_VERSION ?? pkg.version;
	const problems: string[] = [];
	if (name === undefined) {
		problems.push(
			problem(
				"MCP_SERVER_NAME",
				"not set and package.json has no name. Set it, or start the server from the project root.",
			),
		);
	}
	if (version === undefined) {
		problems.push(
			problem(
				"MCP_SERVER_VERSION",
				"not set and package.json has no version. Set it, or start the server from the project root.",
			),
		);
	}
	if (name === undefined || version === undefined) {
		return { problems };
	}

	const publicUrl = (parsed.MCP_PUBLIC_URL ?? DEFAULT_PUBLIC_URL).replace(
		/\/+$/,
		"",
	);
	return {
		config: {
			...parsed,
			MCP_SERVER_NAME: name,
			MCP_SERVER_VERSION: version,
			MCP_PUBLIC_URL: publicUrl,
			AUTH_AUDIENCE: parsed.AUTH_AUDIENCE ?? `${publicUrl}/mcp`,
			// Production requires these to be set; elsewhere a per-process value keeps zero-config starts working.
			MCP_REQUEST_STATE_SECRET:
				parsed.MCP_REQUEST_STATE_SECRET ?? randomSecret(),
			LOG_PSEUDONYM_KEY: parsed.LOG_PSEUDONYM_KEY ?? randomSecret(),
			DEV_AUTH_JWT_SECRET: parsed.DEV_AUTH_JWT_SECRET ?? randomSecret(),
		},
	};
}

/** Parses the environment into an `AppConfig`, or lists every problem. Never includes a value. */
export function parseConfig(env: Env): ConfigResult {
	const result = envSchema.safeParse(env);
	const fieldProblems = result.success
		? []
		: result.error.issues.map((issue) => {
				const key = issue.path[0] as EnvKey;
				return problem(key, FIELD_HELP[key]);
			});
	const problems = [...new Set([...fieldProblems, ...crossFieldProblems(env)])];
	if (!result.success || problems.length > 0) {
		return { ok: false, problems };
	}

	const built = toAppConfig(result.data);
	return "config" in built
		? { ok: true, config: built.config }
		: { ok: false, problems: built.problems };
}

/**
 * Rules for the HTTP entry only. stdio has no HTTP request and no token, so it skips them and
 * starts with no auth config (NFR-5).
 */
export function httpEntryProblems({
	AUTH_MODE,
	AUTH_ISSUER,
}: Pick<AppConfig, "AUTH_MODE" | "AUTH_ISSUER">): string[] {
	if (AUTH_MODE === "external" && AUTH_ISSUER === undefined) {
		return [
			problem(
				"AUTH_ISSUER",
				"required when AUTH_MODE=external. Set it to your issuer URL, or set AUTH_MODE=dev for local development.",
			),
		];
	}
	return [];
}

export function formatProblems(problems: string[]): string {
	return ["Invalid configuration:", ...problems.map((p) => `  ${p}`)].join(
		"\n",
	);
}

/** Prints the problems and stops the process with exit code 1. Does nothing when there are none. */
export function exitOnProblems(problems: string[]): void {
	if (problems.length === 0) {
		return;
	}
	process.stderr.write(`${formatProblems(problems)}\n`);
	process.exit(1);
}

/**
 * The `@nestjs/config` validate hook. It runs when `platform.module.ts` is imported, before
 * bootstrap, so it reports and exits itself rather than throwing into Nest (ADR-0004).
 */
export function validateConfig(env: Env): AppConfig {
	const result = parseConfig(env);
	if (!result.ok) {
		exitOnProblems(result.problems);
		throw new Error("Invalid configuration.");
	}
	return result.config;
}
