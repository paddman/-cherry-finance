import { uuidv7 } from 'uuidv7';

export const logRedactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.refreshToken',
  'req.body.otp',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.documentContent'
] as const;

export function createTraceId(): string {
  return uuidv7();
}

export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

export function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}
