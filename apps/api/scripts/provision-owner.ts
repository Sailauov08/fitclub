/**
 * Secure initial owner provisioning for a fresh (production) database.
 *
 *   npm run provision:owner -- --email owner@yourclub.kz --first Aigerim --last Saparova
 *
 * - Works only while the club has no OWNER (cannot be used to take over an existing club).
 * - Never accepts a password on the command line (it would land in shell history):
 *   the script issues a single-use, 72-hour activation link instead and prints it once.
 * - Creates the Club row with default settings if it does not exist yet.
 */
import { config } from 'dotenv';

config({ quiet: true });
import { createHash, randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { DEFAULT_CLUB_SETTINGS, DEFAULT_NOTIFICATION_PREFS, emailSchema, personNameSchema } from '@fitclub/shared';
import { PrismaClient } from '../src/generated/prisma/client';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = emailSchema.parse(arg('email'));
  const firstName = personNameSchema.parse(arg('first') ?? 'Owner');
  const lastName = personNameSchema.parse(arg('last') ?? 'Account');
  const webUrl = process.env.PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    if (await prisma.staffMember.count({ where: { role: 'OWNER' } })) {
      console.error('An owner already exists. Invite additional staff from Admin → Employees.');
      process.exit(1);
    }
    if (!(await prisma.club.findFirst())) {
      await prisma.club.create({ data: { name: DEFAULT_CLUB_SETTINGS.name, settings: DEFAULT_CLUB_SETTINGS } });
    }
    const user =
      (await prisma.user.findUnique({ where: { email } })) ??
      (await prisma.user.create({
        data: { email, profile: { create: { firstName, lastName, notificationPrefs: DEFAULT_NOTIFICATION_PREFS } } },
      }));
    await prisma.staffMember.upsert({
      where: { userId: user.id },
      create: { userId: user.id, role: 'OWNER' },
      update: { role: 'OWNER', status: 'ACTIVE' },
    });
    const token = randomBytes(32).toString('base64url');
    await prisma.authToken.create({
      data: {
        type: 'STAFF_INVITE',
        email,
        userId: user.id,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() + 72 * 3_600_000),
        payload: { role: 'OWNER' },
      },
    });
    await prisma.auditLog.create({
      data: { actorId: null, action: 'staff.owner_provisioned', entityType: 'User', entityId: user.id },
    });
    console.log(`Owner account prepared for ${email}.`);
    console.log(
      `Open this single-use link within 72 hours to set the password:\n${webUrl}/ru/reset-password?token=${token}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
