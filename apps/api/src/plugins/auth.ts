import { importSPKI, jwtVerify } from 'jose';
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler
} from 'fastify';
import type { ApiConfig } from '../config.js';
import { AppError } from '../errors.js';

export interface Principal {
  userId: string;
  sessionId?: string;
  authMode: 'development' | 'jwt';
}

declare module 'fastify' {
  interface FastifyRequest {
    principal: Principal;
  }
}

function bearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Bearer token is required');
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError(401, 'AUTH_REQUIRED', 'Bearer token is required');
  }

  return token;
}

export async function registerAuthentication(
  app: FastifyInstance,
  config: ApiConfig
): Promise<preHandlerHookHandler> {
  app.decorateRequest('principal', null as unknown as Principal);

  let publicKey: CryptoKey | undefined;
  if (config.AUTH_MODE === 'jwt') {
    const pem = config.JWT_PUBLIC_KEY_PEM?.replaceAll('\\n', '\n');
    if (!pem) {
      throw new Error('JWT public key was not configured');
    }
    publicKey = await importSPKI(pem, 'ES256');
  }

  return async (request): Promise<void> => {
    if (config.AUTH_MODE === 'development') {
      const headerValue = request.headers['x-user-id'];
      const userId =
        typeof headerValue === 'string' && headerValue.length > 0
          ? headerValue
          : config.DEV_USER_ID;

      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        throw new AppError(400, 'INVALID_USER_ID', 'x-user-id must be a UUID');
      }

      request.principal = {
        userId,
        authMode: 'development'
      };
      return;
    }

    const token = bearerToken(request);
    try {
      const verification = await jwtVerify(token, publicKey as CryptoKey, {
        algorithms: ['ES256'],
        issuer: config.JWT_ISSUER,
        audience: config.JWT_AUDIENCE
      });

      if (!verification.payload.sub) {
        throw new AppError(401, 'TOKEN_INVALID', 'Token subject is missing');
      }

      request.principal = {
        userId: verification.payload.sub,
        authMode: 'jwt',
        ...(typeof verification.payload.sid === 'string'
          ? { sessionId: verification.payload.sid }
          : {})
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, 'TOKEN_INVALID', 'Token is invalid or expired');
    }
  };
}
