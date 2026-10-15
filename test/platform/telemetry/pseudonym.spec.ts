import { createHmac } from "node:crypto";
import {
	PSEUDO_ID_ATTRIBUTE,
	pseudoIdAttributes,
	pseudonymise,
} from "../../../src/platform/telemetry/pseudonym";

const KEY = "k".repeat(32);

describe("pseudonymise", () => {
	it("is HMAC-SHA256 of sub keyed with LOG_PSEUDONYM_KEY, as hex", () => {
		// RFC 4231 test case 2.
		expect(pseudonymise("what do ya want for nothing?", "Jefe")).toBe(
			"5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
		);
		expect(pseudonymise("user-123", KEY)).toBe(
			createHmac("sha256", KEY).update("user-123").digest("hex"),
		);
	});

	it("differs by key, so it can't be matched without the key", () => {
		expect(pseudonymise("user-123", KEY)).not.toBe(
			pseudonymise("user-123", "j".repeat(32)),
		);
	});
});

describe("pseudoIdAttributes", () => {
	it("records enduser.pseudo.id and nothing else from the user", () => {
		const attributes = pseudoIdAttributes(
			{ sub: "user-123", email: "a@b.test", name: "A" },
			KEY,
		);
		expect(attributes).toEqual({
			[PSEUDO_ID_ATTRIBUTE]: pseudonymise("user-123", KEY),
		});
		expect(JSON.stringify(attributes)).not.toMatch(/user-123|a@b\.test/);
	});

	it("records nothing without a sub", () => {
		expect(pseudoIdAttributes(undefined, KEY)).toEqual({});
		expect(pseudoIdAttributes({ sub: "" }, KEY)).toEqual({});
		expect(pseudoIdAttributes({ sub: 42 }, KEY)).toEqual({});
	});
});
