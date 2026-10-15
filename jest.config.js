/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: "node",
	roots: ["<rootDir>/test"],
	testRegex: ".*\\.spec\\.ts$",
	extensionsToTreatAsEsm: [".ts"],
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
