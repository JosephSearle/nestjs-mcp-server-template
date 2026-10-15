import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import {
	LEGACY_INITIALIZE,
	modernClient,
	UNSUPPORTED_PROTOCOL_VERSION,
} from "../../support/mcp-client";

// stdio has to run as its own process, so the spec compiles src/ first. CI runs tests before
// `npm run build`, and a stale dist/ would test old code. The output sits under node_modules so the
// compiled files resolve packages from the project.
const root = process.cwd();
const outDir = join(root, "node_modules", ".cache", "stdio-spec");
const entry = join(outDir, "main.stdio.js");

// An empty cwd has no .env, which is NFR-5's "no .env" start. Config reads package.json from the
// cwd, so the name and version come from the environment instead.
let cwd: string;
// SystemRoot keeps Node working on Windows with an otherwise empty environment.
const baseEnv = (): Record<string, string> => ({
	PATH: process.env.PATH ?? "",
	SystemRoot: process.env.SystemRoot ?? "",
	MCP_SERVER_NAME: "stdio-spec",
	MCP_SERVER_VERSION: "0.0.0",
});

beforeAll(() => {
	execFileSync(
		process.execPath,
		[
			join(root, "node_modules", "typescript", "bin", "tsc"),
			"-p",
			join(root, "tsconfig.build.json"),
			"--outDir",
			outDir,
			"--incremental",
			"false",
			"--sourceMap",
			"false",
		],
		{ stdio: "inherit" },
	);
	cwd = mkdtempSync(join(tmpdir(), "stdio-spec-"));
}, 60_000);

afterAll(() => {
	rmSync(cwd, { recursive: true, force: true });
});

/** Runs the entry with `input` on stdin and collects both streams until it exits. */
function run(input: string, env: Record<string, string>) {
	return new Promise<{ code: number | null; stdout: string; stderr: string }>(
		(resolve) => {
			const child = spawn(process.execPath, [entry], { cwd, env });
			let stdout = "";
			let stderr = "";
			child.stdout.on("data", (chunk) => {
				stdout += chunk;
			});
			child.stderr.on("data", (chunk) => {
				stderr += chunk;
			});
			// Leave time for one reply, then close stdin so the server exits.
			const timer = setTimeout(() => child.stdin.end(), 1500);
			child.on("close", (code) => {
				clearTimeout(timer);
				resolve({ code, stdout, stderr });
			});
			child.stdin.write(input);
		},
	);
}

describe("stdio entry", () => {
	it("serves revision 2026-07-28 with no .env", async () => {
		const client = modernClient();
		await client.connect(
			new StdioClientTransport({
				command: process.execPath,
				args: [entry],
				cwd,
				env: baseEnv(),
				stderr: "pipe",
			}),
		);
		expect(client.getNegotiatedProtocolVersion()).toBe("2026-07-28");
		const { tools } = await client.listTools();
		expect(tools.map((tool) => tool.name)).toContain("echo");
		await client.close();
	}, 20_000);

	it("rejects a 2025-era initialize and writes only JSON-RPC to stdout", async () => {
		const { stdout, stderr } = await run(
			`${JSON.stringify(LEGACY_INITIALIZE)}\n`,
			baseEnv(),
		);
		const lines = stdout.trim().split("\n");
		expect(lines).toHaveLength(1);
		expect(JSON.parse(lines[0]).error.code).toBe(UNSUPPORTED_PROTOCOL_VERSION);
		// Nest's logs went to stderr instead.
		expect(stderr).toContain("MCP stdio transport started");
	}, 20_000);

	it("refuses to start when NODE_ENV=production", async () => {
		const { code, stdout, stderr } = await run("", {
			...baseEnv(),
			NODE_ENV: "production",
		});
		expect(code).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain(
			"NODE_ENV: stdio is not allowed when NODE_ENV=production.",
		);
	}, 20_000);
});
