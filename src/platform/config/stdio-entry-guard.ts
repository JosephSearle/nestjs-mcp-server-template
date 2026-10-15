import { exitOnProblems, stdioEntryProblems } from "./validate-config";

// Imported first by main.stdio.ts. The config schema runs when platform.module.ts is imported and
// would report every production-only variable first; this names the real problem on its own.
// A NODE_ENV set only in .env is caught after config loads, in startStdio.
exitOnProblems(
	stdioEntryProblems({
		NODE_ENV:
			process.env.NODE_ENV === "production" ? "production" : "development",
	}),
);
