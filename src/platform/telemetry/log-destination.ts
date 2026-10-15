import pino, { type DestinationStream } from "pino";

let destination: DestinationStream | undefined;

/**
 * Sends every log line to stderr. Called by the stdio entry before the app is created: stdout
 * carries the protocol there, so nothing else may write to it.
 */
export function logToStderr(): void {
	destination = pino.destination({ fd: 2, sync: true });
}

/** The stream logs go to, or `undefined` for pino's default, stdout. */
export const logDestination = (): DestinationStream | undefined => destination;
