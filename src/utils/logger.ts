/**
 * Environment-aware logger.
 * Suppresses debug, info, and verbose logging in production environments,
 * while preserving warnings and errors for runtime diagnostics.
 */

const isProd = Boolean((import.meta as any).env?.PROD);

export const logger = {
  debug: (...args: unknown[]) => {
    if (!isProd) {
      console.debug(...args);
    }
  },
  info: (...args: unknown[]) => {
    if (!isProd) {
      console.info(...args);
    }
  },
  log: (...args: unknown[]) => {
    if (!isProd) {
      console.log(...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },
  error: (...args: unknown[]) => {
    console.error(...args);
  }
};
