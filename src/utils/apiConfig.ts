import { Capacitor } from '@capacitor/core';
import { logger } from './logger';

/**
 * Validates that an API base URL is secure and well-formed.
 * Intended contract for VITE_API_BASE_URL:
 * - Must be a valid absolute HTTP/HTTPS URL
 * - Strictly requires HTTPS in production
 * - Rejects embedded credentials (username/password)
 * - Rejects query parameters (?...) and hash fragments (#...)
 * - Requires a valid, non-empty hostname
 */
export function isValidApiBaseUrl(candidate: unknown, isProduction: boolean = Boolean((import.meta as any).env?.PROD)): boolean {
  if (typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);

    // 1. Protocol validation: HTTPS required in production
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      logger.warn(`[API Config] Unsupported protocol '${parsed.protocol}'.`);
      return false;
    }
    if (isProduction && parsed.protocol !== 'https:') {
      logger.warn(`[API Config] Insecure protocol '${parsed.protocol}' rejected for production API endpoint.`);
      return false;
    }

    // 2. Reject embedded user credentials
    if (parsed.username || parsed.password) {
      logger.warn(`[API Config] Embedded credentials rejected in API URL: '${trimmed}'`);
      return false;
    }

    // 3. Reject query parameters or hash fragments in base URLs
    if (parsed.search || parsed.hash) {
      logger.warn(`[API Config] Query strings and hash fragments are not permitted in base URLs: '${trimmed}'`);
      return false;
    }

    // 4. Validate hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      logger.warn(`[API Config] Missing hostname in API URL: '${trimmed}'`);
      return false;
    }

    return true;
  } catch {
    logger.warn(`[API Config] Malformed API URL: '${trimmed}'`);
    return false;
  }
}

/**
 * Resolves the API base URL for network calls.
 * 
 * - In local web browser / same-origin environment: Returns '' so requests use relative URLs
 *   handled directly by Vite dev server or Express server.
 * - In native Capacitor builds: Requires an explicitly configured VITE_API_BASE_URL.
 *   If absent or invalid, returns '' and allows the client-side coaching fallback to serve
 *   the athlete reliably without silently leaking requests to development backends.
 */
export function getApiBaseUrl(): string {
  const isProd = Boolean((import.meta as any).env?.PROD);
  const isNative = Capacitor.isNativePlatform();
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;

  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    const cleanUrl = envUrl.trim().replace(/\/+$/, '');
    if (isValidApiBaseUrl(cleanUrl, isProd)) {
      return cleanUrl;
    }
    logger.warn(`[API Config] Configured VITE_API_BASE_URL '${envUrl}' failed validation.`);
  }

  if (isNative) {
    // Native runtime without an explicitly configured, validated production endpoint.
    // We intentionally return empty string rather than silently defaulting to a dev backend.
    return '';
  }

  // Web same-origin
  return '';
}

/**
 * Builds an API endpoint URL.
 * In native builds without a configured remote API server, returns '' to prompt the caller
 * to use the client-side rule-based coaching fallback directly.
 */
export function buildApiUrl(endpoint: string): string {
  const isNative = Capacitor.isNativePlatform();
  const base = getApiBaseUrl();

  if (isNative && !base) {
    // Native build without configured backend URL
    return '';
  }

  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
