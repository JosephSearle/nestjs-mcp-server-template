import { ConsoleLogger, type LogLevel } from "@nestjs/common";

/**
 * Writes every level to stderr. Under stdio, stdout carries the protocol, so nothing else may use it.
 * #14 replaces this with pino.
 */
export class StderrLogger extends ConsoleLogger {
	protected override printMessages(
		messages: unknown[],
		context?: string,
		logLevel?: LogLevel,
		_writeStreamType?: "stdout" | "stderr",
		errorStack?: unknown,
		params?: Record<string, unknown>,
	): void {
		super.printMessages(
			messages,
			context,
			logLevel,
			"stderr",
			errorStack,
			params,
		);
	}
}
