import { telemetrySettings } from "../../../src/platform/config/telemetry-env";

const ENDPOINT = { OTEL_EXPORTER_OTLP_ENDPOINT: "http://collector:4318" };

describe("telemetrySettings", () => {
	it("runs no exporter when OTEL_EXPORTER_OTLP_ENDPOINT is unset or empty", () => {
		for (const env of [{}, { OTEL_EXPORTER_OTLP_ENDPOINT: "" }]) {
			const result = telemetrySettings(env);
			expect(result).toMatchObject({
				ok: true,
				settings: { exporter: "none" },
			});
		}
	});

	it("ignores the protocol when there is no endpoint", () => {
		expect(
			telemetrySettings({ OTEL_EXPORTER_OTLP_PROTOCOL: "bogus" }),
		).toMatchObject({ ok: true, settings: { exporter: "none" } });
	});

	it("uses http/protobuf by default", () => {
		expect(telemetrySettings(ENDPOINT)).toMatchObject({
			ok: true,
			settings: { exporter: "otlp", protocol: "http/protobuf" },
		});
	});

	it("selects grpc with OTEL_EXPORTER_OTLP_PROTOCOL", () => {
		expect(
			telemetrySettings({ ...ENDPOINT, OTEL_EXPORTER_OTLP_PROTOCOL: "grpc" }),
		).toMatchObject({
			ok: true,
			settings: { exporter: "otlp", protocol: "grpc" },
		});
	});

	it("reports any other protocol without its value", () => {
		const result = telemetrySettings({
			...ENDPOINT,
			OTEL_EXPORTER_OTLP_PROTOCOL: "http/json-secret-value",
		});
		expect(result).toEqual({
			ok: false,
			problems: [
				"OTEL_EXPORTER_OTLP_PROTOCOL: must be http/protobuf or grpc. Set it to one of those values, or unset it for http/protobuf.",
			],
		});
	});

	it("sets the resource from OTEL_SERVICE_NAME, the server name and NODE_ENV", () => {
		const result = telemetrySettings({
			OTEL_SERVICE_NAME: "svc",
			MCP_SERVER_NAME: "ignored",
			MCP_SERVER_VERSION: "1.2.3",
			NODE_ENV: "production",
		});
		expect(result).toMatchObject({
			ok: true,
			settings: {
				resource: {
					"service.name": "svc",
					"service.version": "1.2.3",
					"deployment.environment.name": "production",
				},
			},
		});
	});

	it("falls back to MCP_SERVER_NAME, then package.json", () => {
		expect(telemetrySettings({ MCP_SERVER_NAME: "named" })).toMatchObject({
			settings: { resource: { "service.name": "named" } },
		});
		expect(telemetrySettings({})).toMatchObject({
			settings: {
				resource: {
					"service.name": "nestjs-mcp-server-template",
					"deployment.environment.name": "development",
				},
			},
		});
	});
});
