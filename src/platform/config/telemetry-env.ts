import { readPackageJson } from "./validate-config";

type Env = Record<string, string | undefined>;

export const OTLP_PROTOCOLS = ["http/protobuf", "grpc"] as const;
export type OtlpProtocol = (typeof OTLP_PROTOCOLS)[number];

export interface TelemetryResource {
	"service.name": string;
	"service.version": string;
	"deployment.environment.name": string;
}

export type TelemetrySettings = { resource: TelemetryResource } & (
	| { exporter: "none" }
	| { exporter: "otlp"; protocol: OtlpProtocol }
);

export type TelemetrySettingsResult =
	| { ok: true; settings: TelemetrySettings }
	| { ok: false; problems: string[] };

const value = (env: Env, key: string) =>
	env[key] === undefined || env[key] === "" ? undefined : env[key];

/**
 * Reads the standard OTEL_* variables the SDK bootstrap needs before Nest and its config load
 * (spec §7). The exporters read their own OTEL_EXPORTER_OTLP_* variables (headers, per-signal
 * endpoints); this only decides whether any exporter runs, and which protocol package to use.
 */
export function telemetrySettings(env: Env): TelemetrySettingsResult {
	const pkg = readPackageJson();
	const resource: TelemetryResource = {
		"service.name":
			value(env, "OTEL_SERVICE_NAME") ??
			value(env, "MCP_SERVER_NAME") ??
			pkg.name ??
			"unknown_service",
		"service.version":
			value(env, "MCP_SERVER_VERSION") ?? pkg.version ?? "unknown",
		"deployment.environment.name": value(env, "NODE_ENV") ?? "development",
	};

	if (value(env, "OTEL_EXPORTER_OTLP_ENDPOINT") === undefined) {
		return { ok: true, settings: { resource, exporter: "none" } };
	}

	const protocol = value(env, "OTEL_EXPORTER_OTLP_PROTOCOL") ?? "http/protobuf";
	if (!(OTLP_PROTOCOLS as readonly string[]).includes(protocol)) {
		return {
			ok: false,
			problems: [
				`OTEL_EXPORTER_OTLP_PROTOCOL: must be ${OTLP_PROTOCOLS.join(" or ")}. Set it to one of those values, or unset it for http/protobuf.`,
			],
		};
	}
	return {
		ok: true,
		settings: {
			resource,
			exporter: "otlp",
			protocol: protocol as OtlpProtocol,
		},
	};
}

/** The settings for this process. */
export const processTelemetrySettings = () => telemetrySettings(process.env);
