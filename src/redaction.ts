import {Logger, LogLevel} from 'homebridge';
import {format} from 'util';

/** Replacement text for anything secret in a log line. */
export const REDACTED = '[redacted]';

/**
 * The Tedee local API token is sha256(apiKey + timestamp) in hex followed by the millisecond timestamp.
 * The hash alone is enough for an offline guess of a weak key, so any 64 hex character run is redacted.
 */
const API_TOKEN_PATTERN = /[0-9a-fA-F]{64}\d*/g;

export type Redactor = (text: string) => string;

/** Every spelling of a secret that can end up in a log line: raw, URL encoded, JSON escaped (once and twice), inspect quoted. */
function secretVariants(secrets: ReadonlyArray<unknown>): string[] {
  const variants = new Set<string>();
  for (const secret of secrets) {
    if (typeof secret !== 'string' && typeof secret !== 'number') {
      continue;
    }
    const raw = String(secret);
    if (raw.length === 0) {
      continue;
    }
    const jsonEscaped = JSON.stringify(raw).slice(1, -1);
    variants.add(raw);
    variants.add(encodeURIComponent(raw));
    variants.add(jsonEscaped);
    variants.add(JSON.stringify(jsonEscaped).slice(1, -1));
    variants.add(raw.replace(/'/g, '\\\''));
  }
  // Longest first, so a longer spelling is never left half replaced by a shorter one.
  return [...variants].sort((a, b) => b.length - a.length);
}

/**
 * Creates a function that removes the configured secrets and any api_token from a text.
 * The secrets are read on every call, so a key changed at runtime is still redacted.
 */
export function createSecretRedactor(getSecrets: () => ReadonlyArray<unknown>): Redactor {
  return (text: string): string => {
    const withoutTokens = text.replace(API_TOKEN_PATTERN, REDACTED);
    return secretVariants(getSecrets()).reduce((out, variant) => out.split(variant).join(REDACTED), withoutTokens);
  };
}

/**
 * Wraps a Homebridge logger so every level formats its message and parameters first
 * (including Error objects with their stack) and removes secrets before anything is written.
 */
export function createRedactingLogger(log: Logger, redact: Redactor): Logger {
  const safe = (message: unknown, parameters: unknown[]): string => redact(format(message, ...parameters));
  const info = (message: unknown, ...parameters: unknown[]) => log.info(safe(message, parameters));

  const wrapped = Object.assign(
    (message: unknown, ...parameters: unknown[]) => info(message, ...parameters),
    {
      prefix: log.prefix,
      info,
      success: (message: unknown, ...parameters: unknown[]) => (log.success ?? log.info).call(log, safe(message, parameters)),
      warn: (message: unknown, ...parameters: unknown[]) => log.warn(safe(message, parameters)),
      error: (message: unknown, ...parameters: unknown[]) => log.error(safe(message, parameters)),
      debug: (message: unknown, ...parameters: unknown[]) => log.debug(safe(message, parameters)),
      log: (level: LogLevel, message: unknown, ...parameters: unknown[]) => log.log(level, safe(message, parameters)),
    },
  );
  return wrapped as unknown as Logger;
}

/** A short, secret free description of an error: no request config, no headers, no body. */
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) {
    return format(error);
  }
  const details = error as Error & {code?: unknown; response?: {status?: unknown}; config?: {method?: unknown; url?: unknown}};
  const parts = [`${error.name}: ${error.message}`];
  if (details.code !== undefined) {
    parts.push(`code=${String(details.code)}`);
  }
  if (details.response?.status !== undefined) {
    parts.push(`status=${String(details.response.status)}`);
  }
  if (details.config?.method !== undefined || details.config?.url !== undefined) {
    parts.push(`request=${String(details.config?.method ?? '').toUpperCase()} ${String(details.config?.url ?? '')}`);
  }
  return parts.join(' ');
}
