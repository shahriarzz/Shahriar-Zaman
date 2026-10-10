import { Capacitor } from '@capacitor/core';

/**
 * Resolves the API base URL for network calls.
 * 
 * - In local web / preview environment: Returns '' so requests use relative URLs
 *   handled directly by Vite dev server or the same-origin Express server.
 * - In Capacitor native runtime (Android/iOS): WebView runs on http://localhost or
 *   https://gainlog.app, so relative URLs do not hit the Express server.
 *   Uses VITE_API_BASE_URL if configured, or falls back to the deployed backend URL.
 */
export function getApiBaseUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (Capacitor.isNativePlatform()) {
    // Canonical backend endpoint for native mobile app runtime
    return 'https://ais-dev-cdzggnhvzeexocyfbuet7z-917271568182.asia-southeast1.run.app';
  }

  // Web same-origin
  return '';
}

/**
 * Builds a fully qualified or relative API endpoint URL.
 */
export function buildApiUrl(endpoint: string): string {
  const base = getApiBaseUrl();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
}
