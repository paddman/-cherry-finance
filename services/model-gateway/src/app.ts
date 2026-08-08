import {
  createTraceId,
  elapsedMilliseconds,
  logRedactPaths
} from '@cherryfin/observability';
import Fastify, { type FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GatewayConfig } from './config.js';

export type FetchLike = (
  input: string | URL,
  init?: RequestInit
) => Promise<Response>;

type Task = 'chat' | 'synthesis' | 'vision' | 'classify';
type Privacy = 'public' | 'private';

interface RouteTarget {
  name: string;
  url: string;
  model: string;
  apiKey?: string;
  hosted: boolean;
}

interface UpstreamResult {
  status: number;
  ok: boolean;
  payload: unknown;
  contentType: string;
}

const TaskSchema = z.enum(['chat', 'synthesis', 'vision', 'classify']);
const PrivacySchema = z.enum(['public', 'private']);
const ChatRequestSchema = z
  .object({
    model: z.string().optional(),
    messages: z.array(z.record(z.string(), z.unknown())).min(1)
  })
  .passthrough();

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function targets(config: GatewayConfig) {
  const localChat: RouteTarget = {
    name: 'local-chat',
    url: config.LOCAL_CHAT_COMPLETIONS_URL,
    model: config.LOCAL_CHAT_MODEL,
    ...(config.LOCAL_MODEL_API_KEY ? { apiKey: config.LOCAL_MODEL_API_KEY } : {}),
    hosted: false
  };
  const localSynthesis: RouteTarget = {
    name: 'local-synthesis',
    url: config.LOCAL_SYNTHESIS_COMPLETIONS_URL,
    model: config.LOCAL_SYNTHESIS_MODEL,
    ...(config.LOCAL_MODEL_API_KEY ? { apiKey: config.LOCAL_MODEL_API_KEY } : {}),
    hosted: false
  };
  const localVision: RouteTarget = {
    name: 'local-vision',
    url: config.LOCAL_VISION_COMPLETIONS_URL,
    model: config.LOCAL_VISION_MODEL,
    ...(config.LOCAL_MODEL_API_KEY ? { apiKey: config.LOCAL_MODEL_API_KEY } : {}),
    hosted: false
  };

  const hostedSynthesis =
    config.HOSTED_SYNTHESIS_COMPLETIONS_URL &&
    config.HOSTED_SYNTHESIS_MODEL
      ? {
          name: 'hosted-synthesis',
          url: config.HOSTED_SYNTHESIS_COMPLETIONS_URL,
          model: config.HOSTED_SYNTHESIS_MODEL,
          ...(config.HOSTED_MODEL_API_KEY
            ? { apiKey: config.HOSTED_MODEL_API_KEY }
            : {}),
          hosted: true
        }
      : undefined;

  return { localChat, localSynthesis, localVision, hostedSynthesis };
}

function routeFor(
  task: Task,
  privacy: Privacy,
  config: GatewayConfig
): { primary: RouteTarget; fallback?: RouteTarget } {
  const available = targets(config);

  switch (task) {
    case 'chat':
    case 'classify':
      return { primary: available.localChat };
    case 'vision':
      return { primary: available.localVision };
    case 'synthesis':
      return {
        primary: available.localSynthesis,
        ...(privacy === 'public' && available.hostedSynthesis
          ? { fallback: available.hostedSynthesis }
          : {})
      };
  }
}

async function invokeUpstream(
  target: RouteTarget,
  body: Record<string, unknown>,
  traceId: string,
  timeoutMs: number,
  fetcher: FetchLike
): Promise<UpstreamResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const headers = new Headers({
    'content-type': 'application/json',
    'x-trace-id': traceId
  });
  if (target.apiKey) {
    headers.set('authorization', `Bearer ${target.apiKey}`);
  }

  try {
    const response = await fetcher(target.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, model: target.model }),
      signal: controller.signal
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = {
        error: {
          code: 'UPSTREAM_INVALID_RESPONSE',
          message: 'Model upstream returned a non-JSON response'
        }
      };
    }

    return {
      status: response.status,
      ok: response.ok,
      payload,
      contentType: response.headers.get('content-type') ?? 'application/json'
    };
  } finally {
    clearTimeout(timeout);
  }
}

function unavailable(traceId: string, message: string) {
  return {
    error: {
      code: 'MODEL_UNAVAILABLE',
      message,
      traceId
    }
  };
}

export async function buildModelGateway(
  config: GatewayConfig,
  fetcher: FetchLike = fetch
): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : {
            level: config.LOG_LEVEL,
            redact: {
              paths: [...logRedactPaths],
              censor: '[REDACTED]'
            }
          },
    genReqId: () => createTraceId(),
    bodyLimit: 10_485_760,
    requestTimeout: config.UPSTREAM_TIMEOUT_MS + 5_000
  });

  app.get('/healthz', async () => ({
    status: 'ok',
    service: 'model-gateway',
    version: config.APP_VERSION,
    timestamp: new Date().toISOString()
  }));

  app.get('/readyz', async () => {
    const configured = targets(config);
    return {
      status: 'ok',
      service: 'model-gateway',
      version: config.APP_VERSION,
      timestamp: new Date().toISOString(),
      routes: {
        chat: configured.localChat.name,
        synthesis: configured.localSynthesis.name,
        vision: configured.localVision.name,
        publicFallback: configured.hostedSynthesis?.name ?? null
      }
    };
  });

  app.post('/v1/chat/completions', async (request, reply) => {
    if (
      config.INTERNAL_API_KEY &&
      request.headers['x-internal-api-key'] !== config.INTERNAL_API_KEY
    ) {
      return reply.code(401).send({
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Internal API key is required',
          traceId: request.id
        }
      });
    }

    const task = TaskSchema.safeParse(
      firstHeader(request.headers['x-cherryfin-task']) ?? 'chat'
    );
    const privacy = PrivacySchema.safeParse(
      firstHeader(request.headers['x-cherryfin-privacy']) ?? 'private'
    );
    const body = ChatRequestSchema.safeParse(request.body);

    if (!task.success || !privacy.success || !body.success) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_FAILED',
          message: 'Invalid model gateway request',
          traceId: request.id
        }
      });
    }

    const selected = routeFor(task.data, privacy.data, config);
    const startedAt = performance.now();

    try {
      const primary = await invokeUpstream(
        selected.primary,
        body.data,
        request.id,
        config.UPSTREAM_TIMEOUT_MS,
        fetcher
      );

      if (primary.ok || primary.status < 500) {
        reply.header('x-cherryfin-route', selected.primary.name);
        reply.header(
          'x-cherryfin-latency-ms',
          String(elapsedMilliseconds(startedAt))
        );
        return reply
          .type(primary.contentType)
          .code(primary.status)
          .send(primary.payload);
      }

      if (selected.fallback) {
        const fallback = await invokeUpstream(
          selected.fallback,
          body.data,
          request.id,
          config.UPSTREAM_TIMEOUT_MS,
          fetcher
        );
        reply.header('x-cherryfin-route', selected.fallback.name);
        reply.header(
          'x-cherryfin-latency-ms',
          String(elapsedMilliseconds(startedAt))
        );
        return reply
          .type(fallback.contentType)
          .code(fallback.status)
          .send(fallback.payload);
      }

      request.log.error(
        {
          traceId: request.id,
          task: task.data,
          privacy: privacy.data,
          route: selected.primary.name,
          upstreamStatus: primary.status
        },
        'Local model route unavailable and fallback forbidden or unconfigured'
      );
      return reply
        .code(503)
        .send(unavailable(request.id, 'The required local model is unavailable'));
    } catch (error) {
      if (selected.fallback) {
        try {
          const fallback = await invokeUpstream(
            selected.fallback,
            body.data,
            request.id,
            config.UPSTREAM_TIMEOUT_MS,
            fetcher
          );
          reply.header('x-cherryfin-route', selected.fallback.name);
          reply.header(
            'x-cherryfin-latency-ms',
            String(elapsedMilliseconds(startedAt))
          );
          return reply
            .type(fallback.contentType)
            .code(fallback.status)
            .send(fallback.payload);
        } catch (fallbackError) {
          request.log.error(
            { err: fallbackError, traceId: request.id },
            'Hosted model fallback failed'
          );
        }
      }

      request.log.error(
        {
          err: error,
          traceId: request.id,
          task: task.data,
          privacy: privacy.data,
          route: selected.primary.name
        },
        'Model route failed'
      );
      return reply
        .code(503)
        .send(unavailable(request.id, 'The required model route is unavailable'));
    }
  });

  return app;
}
