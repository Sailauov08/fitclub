import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { join } from 'node:path';
import { env, isProduction } from './config/env';
import { AppModule } from './app.module';
import { StorageService } from './modules/media/storage.service';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true, rawBody: true });
  app.useLogger(app.get(Logger));
  app.set('trust proxy', env.TRUST_PROXY);
  if (env.CLIENT_IP_HEADER) {
    // Behind a proxy chain (Vercel rewrite → API) `req.ip` would be the proxy; the platform puts the
    // real client address in a dedicated header that clients cannot spoof.
    const header = env.CLIENT_IP_HEADER.toLowerCase();
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const value = req.headers[header];
      const ip = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
      if (ip) Object.defineProperty(req, 'ip', { value: ip, configurable: true });
      next();
    });
  }
  app.disable('x-powered-by');
  app.setGlobalPrefix('api');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          // Swagger UI needs inline styles/scripts; the API serves no other HTML.
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.useBodyParser('json', { limit: '1mb' });
  app.enableCors({
    origin: env.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
  if (env.STORAGE_DRIVER === 'database') {
    const storage = app.get(StorageService);
    app.use('/uploads', (req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return next();
      storage
        .readStored(decodeURIComponent(req.path.replace(/^\//, '')))
        .then((file) => {
          if (!file) return void res.status(404).end();
          // Keys are random and never reused, so the content is immutable.
          res.setHeader('Content-Type', file.contentType);
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "default-src 'none'");
          res.end(Buffer.from(file.bytes));
        })
        .catch(next);
    });
  } else {
    app.useStaticAssets(join(process.cwd(), env.UPLOAD_DIR), {
      prefix: '/uploads/',
      maxAge: '7d',
      setHeaders: (res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'");
      },
    });
  }
  app.enableShutdownHooks();

  if (!isProduction || env.SWAGGER_ENABLED) {
    const config = new DocumentBuilder()
      .setTitle('FITCLUB API')
      .setDescription(
        'REST API for the FITCLUB website, member portal and administration. Cookie-based sessions; state-changing requests need the X-CSRF-Token header.',
      )
      .setVersion('1.0.0')
      .addCookieAuth('fc_session')
      .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, config));
  }
  return app;
}

async function bootstrap() {
  const app = await createApp();
  await app.listen(env.PORT);
  app.get(Logger).log(`FITCLUB API listening on http://localhost:${env.PORT}/api (docs: /api/docs)`);
}

/**
 * Serverless entry point (Vercel): the default export handles each request. The Nest app is created
 * once per function instance and reused while the instance stays warm.
 */
let server: Promise<(req: Request, res: Response) => void> | undefined;

export default async function handler(req: Request, res: Response) {
  server ??= createApp().then(async (app) => {
    await app.init();
    return app.getHttpAdapter().getInstance() as (req: Request, res: Response) => void;
  });
  const handle = await server.catch((error: unknown) => {
    server = undefined; // retry the bootstrap on the next request instead of caching the failure
    throw error;
  });
  handle(req, res);
}

if (require.main === module) {
  void bootstrap();
}
