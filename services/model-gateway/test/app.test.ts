import { describe, expect, it } from 'vitest';
import { buildModelGateway, type FetchLike } from '../src/app.js';
import type { GatewayConfig } from '../src/config.js';

const baseConfig: GatewayConfig = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  APP_VERSION: 'test',
  MODEL_GATEWAY_HOST: '127.0.0.1',
  MODEL_GATEWAY_PORT: 3100,
  LOCAL_CHAT_COMPLETIONS_URL: 'http://local/chat',
  LOCAL_CHAT_MODEL: 'local-chat',
  LOCAL_SYNTHESIS_COMPLETIONS_URL: 'http://local/synthesis',
  LOCAL_SYNTHESIS_MODEL: 'local-synthesis',
  LOCAL_VISION_COMPLETIONS_URL: 'http://local/vision',
  LOCAL_VISION_MODEL: 'local-vision',
  HOSTED_SYNTHESIS_COMPLETIONS_URL: 'https://hosted/synthesis',
  HOSTED_SYNTHESIS_MODEL: 'hosted-synthesis',
  UPSTREAM_TIMEOUT_MS: 1_000
};

const requestPayload = {
  model: 'client-placeholder',
  messages: [{ role: 'user', content: 'Summarize cash flow' }]
};

describe('model gateway privacy routing', () => {
  it('uses hosted fallback only for public synthesis', async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = async (input) => {
      calls.push(String(input));
      if (String(input).startsWith('http://local')) {
        return new Response(JSON.stringify({ error: 'local down' }), {
          status: 503,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response(
        JSON.stringify({ id: 'completion-1', choices: [{ message: { content: 'ok' } }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' }
        }
      );
    };

    const app = await buildModelGateway(baseConfig, fetcher);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: {
        'x-cherryfin-task': 'synthesis',
        'x-cherryfin-privacy': 'public'
      },
      payload: requestPayload
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-cherryfin-route']).toBe('hosted-synthesis');
    expect(calls).toEqual([
      'http://local/synthesis',
      'https://hosted/synthesis'
    ]);

    await app.close();
  });

  it('never sends private synthesis to the hosted route', async () => {
    const calls: string[] = [];
    const fetcher: FetchLike = async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ error: 'local down' }), {
        status: 503,
        headers: { 'content-type': 'application/json' }
      });
    };

    const app = await buildModelGateway(baseConfig, fetcher);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/chat/completions',
      headers: {
        'x-cherryfin-task': 'synthesis',
        'x-cherryfin-privacy': 'private'
      },
      payload: requestPayload
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({
      error: { code: 'MODEL_UNAVAILABLE' }
    });
    expect(calls).toEqual(['http://local/synthesis']);

    await app.close();
  });
});
