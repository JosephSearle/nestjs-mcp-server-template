// PostToolUse hook: runs `biome check` on the file Claude just wrote or edited.
// Exit code 2 is the only one that shows the failure to Claude, so it can fix it.
// Fixed arguments only: the file path is passed as one argv entry, never through a shell.
import { spawnSync } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

let input = "";
process.stdin.on("data", (chunk) => {
	input += chunk;
});
process.stdin.on("end", () => {
	const event = JSON.parse(input || "{}");
	const file = event.tool_input?.file_path ?? event.tool_response?.filePath;
	if (!file) {
		return;
	}

	// Biome only checks files inside the project.
	const path = relative(root, resolve(root, file));
	if (path === "" || path.startsWith("..") || isAbsolute(path)) {
		return;
	}

	const result = spawnSync(
		process.execPath,
		[
			join(root, "node_modules", "@biomejs", "biome", "bin", "biome"),
			"check",
			"--files-ignore-unknown=true",
			"--no-errors-on-unmatched",
			path,
		],
		{ cwd: root, encoding: "utf8" },
	);
	if (result.status !== 0) {
		process.stderr.write(
			`Biome check failed for ${path}. Fix it, or run npm run format:\n${result.stdout}${result.stderr}`,
		);
		process.exit(2);
	}
});
