/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: "node",
	roots: ["<rootDir>/test"],
	testRegex: ".*\\.spec\\.ts$",
	extensionsToTreatAsEsm: [".ts"],
	// @rekog/mcp-nest is CommonJS, and Nest 12 is ESM-only. Jest can only require() an ES module on
	// Node 24.9 or newer, so on Node 22 the published build can't load Nest. The package ships its
	// TypeScript source, so tests compile that as ESM instead. The build and runtime are unchanged.
	moduleNameMapper: {
		"^@rekog/mcp-nest$": "<rootDir>/node_modules/@rekog/mcp-nest/src/index.ts",
	},
	transformIgnorePatterns: ["/node_modules/(?!@rekog/mcp-nest/)"],
	transform: {
		"^.+\\.ts$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: { module: "esnext", moduleResolution: "bundler" },
			},
		],
	},
};
