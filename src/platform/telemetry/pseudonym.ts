import { createHmac } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { AppConfig } from "../config/config.schema";

/** The attribute that carries identity in logs, traces and metrics (spec §7). */
export const PSEUDO_ID_ATTRIBUTE = "enduser.pseudo.id";

/** HMAC-SHA256 of `sub`, keyed with `LOG_PSEUDONYM_KEY`, as lowercase hex. */
export function pseudonymise(sub: string, key: string): string {
	return createHmac("sha256", key).update(sub, "utf8").digest("hex");
}

/** The pseudonym attribute for a user, or nothing when there is no `sub`. */
export function pseudoIdAttributes(
	user: unknown,
	key: string,
): { [PSEUDO_ID_ATTRIBUTE]?: string } {
	const sub = (user as { sub?: unknown } | undefined)?.sub;
	return typeof sub === "string" && sub !== ""
		? { [PSEUDO_ID_ATTRIBUTE]: pseudonymise(sub, key) }
		: {};
}

/**
 * The only way identity reaches telemetry. Raw `sub`, email, name and tokens are never recorded,
 * and there is no setting to record them (concern 4).
 */
@Injectable()
export class Pseudonymiser {
	private readonly key: string;

	constructor(config: ConfigService<AppConfig, true>) {
		this.key = config.get("LOG_PSEUDONYM_KEY", { infer: true });
	}

	attributesFor(user: unknown): { [PSEUDO_ID_ATTRIBUTE]?: string } {
		return pseudoIdAttributes(user, this.key);
	}
}
