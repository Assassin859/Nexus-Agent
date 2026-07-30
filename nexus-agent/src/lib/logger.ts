import pino from "pino";

/**
 * Structured logger (pino).
 *
 * • In production (NODE_ENV=production): emits raw NDJSON — suitable for
 *   Railway, Datadog, Logtail, and similar log aggregators.
 * • In development: emits colorized, human-readable output via pino-pretty.
 *
 * Control the minimum log level with the LOG_LEVEL env var
 * (trace | debug | info | warn | error | fatal). Defaults to "info".
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  ...(process.env.NODE_ENV !== "production" && {
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "SYS:HH:MM:ss",
        ignore: "pid,hostname",
      },
    },
  }),
});

/**
 * Returns a child logger pre-bound with the given context fields.
 * Use this in every module:
 *
 *   const log = childLogger({ module: "guardian", wallet: userWallet.slice(0, 8) });
 *   log.info("Running evaluation");
 *   log.warn({ reason }, "RPC error — skipping");
 */
export function childLogger(context: Record<string, unknown>) {
  return logger.child(context);
}
