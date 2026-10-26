import { Global, Injectable, Module, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Prisma } from '../generated/prisma/client';
import { env } from '../config/env';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Runs `fn` in a transaction, retrying serialization/deadlock failures a few times.
   * Booking and check-in paths rely on row locks inside these transactions.
   */
  async transaction<T>(
    fn: (tx: Tx) => Promise<T>,
    opts: { isolationLevel?: Prisma.TransactionIsolationLevel } = {},
  ): Promise<T> {
    let attempt = 0;
    for (;;) {
      try {
        return await this.$transaction(fn, { isolationLevel: opts.isolationLevel, maxWait: 10_000, timeout: 20_000 });
      } catch (error) {
        attempt += 1;
        const code = (error as { code?: string }).code;
        const retryable = code === 'P2034' || /40001|40P01|deadlock|could not serialize/i.test(String(error));
        if (!retryable || attempt >= 4) throw error;
        await new Promise((r) => setTimeout(r, 20 * attempt + Math.random() * 30));
      }
    }
  }
}

@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class PrismaModule {}
