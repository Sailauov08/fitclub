/**
 * Sets the password of the seeded demo accounts, e.g. the public password listed in the README for the
 * portfolio demo. DEMO_OWNER_PASSWORD optionally gives owner@fitclub.test a different, private one.
 *
 *   DEMO_PUBLIC_PASSWORD=... [DEMO_OWNER_PASSWORD=...] npx tsx scripts/set-demo-passwords.ts
 *
 * Passwords come from the environment only (never from argv, which lands in shell history).
 * Touches demo users only (isDemo = true), signs them out everywhere and clears lockouts.
 */
import { config } from 'dotenv';

config({ quiet: true });
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { passwordSchema } from '@fitclub/shared';
import { PrismaClient } from '../src/generated/prisma/client';

const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const OWNER_EMAIL = 'owner@fitclub.test';

async function main() {
  const publicPassword = passwordSchema.parse(process.env.DEMO_PUBLIC_PASSWORD);
  const ownerPassword = process.env.DEMO_OWNER_PASSWORD
    ? passwordSchema.parse(process.env.DEMO_OWNER_PASSWORD)
    : publicPassword;

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const reset = { failedLoginCount: 0, lockedUntil: null };
    const publicHash = await argon2.hash(publicPassword, OPTIONS);
    const others = await prisma.user.updateMany({
      where: { isDemo: true, email: { not: OWNER_EMAIL } },
      data: { passwordHash: publicHash, ...reset },
    });
    const owner = await prisma.user.updateMany({
      where: { isDemo: true, email: OWNER_EMAIL },
      data: { passwordHash: await argon2.hash(ownerPassword, OPTIONS), ...reset },
    });
    const sessions = await prisma.session.updateMany({
      where: { revokedAt: null, user: { isDemo: true } },
      data: { revokedAt: new Date() },
    });
    console.log(
      `public password set on ${others.count} demo users; owner updated: ${owner.count}; sessions revoked: ${sessions.count}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
