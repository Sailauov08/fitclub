/**
 * Development seed: one fictional club ("FITCLUB", demo data), three branches, staff, members,
 * plans, schedules, past and upcoming sessions, bookings, check-ins, payments, leads and CMS content.
 *
 * Every number shown in analytics comes from these rows — nothing is hard-coded in the UI.
 * Seeded payments are flagged isTest=true (demo money), users isDemo=true.
 *
 * Refuses to run in production. Demo accounts share SEED_DEMO_PASSWORD (generated if unset).
 */
import { config } from 'dotenv';

config({ quiet: true });
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  addDaysToKey,
  computeMembershipPeriod,
  DEFAULT_CLUB_SETTINGS,
  DEFAULT_NOTIFICATION_PREFS,
  localDateKey,
  localWeekday,
  lt,
  zonedDateTime,
  type LocalizedText,
} from '@fitclub/shared';
import { PrismaClient, Prisma, type MembershipPlan, type PaymentMethod } from '../src/generated/prisma/client';
import { BLOCKS, BLOG, FACILITIES, FAQ, GALLERY, PHOTOS, TESTIMONIALS, img } from './seed-content';

if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed demo data with NODE_ENV=production.');
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Deterministic PRNG so every developer gets the same demo club.
let state = 20261025;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]!;
const chance = (p: number) => rand() < p;

const NOW = new Date();
const TODAY = localDateKey(NOW);
const daysAgo = (n: number, minute = 10 * 60) => zonedDateTime(addDaysToKey(TODAY, -n), minute);
const dbDate = (key: string) => new Date(`${key}T00:00:00Z`);

const OPENING_HOURS = [
  ...Array.from({ length: 5 }, () => ({ open: '06:30', close: '23:00', closed: false })),
  { open: '08:00', close: '22:00', closed: false },
  { open: '08:00', close: '22:00', closed: false },
];

const FIRST_NAMES = [
  'Айгерим',
  'Нурлан',
  'Дана',
  'Ерлан',
  'Алия',
  'Тимур',
  'Мадина',
  'Арман',
  'Асель',
  'Данияр',
  'Жанар',
  'Санжар',
  'Камила',
  'Ильяс',
  'Виктория',
  'Максим',
  'Сауле',
  'Бекзат',
  'Анна',
  'Руслан',
  'Диана',
  'Олжас',
  'Елена',
  'Азамат',
  'Томирис',
  'Артём',
  'Гульнар',
  'Ринат',
  'Милана',
  'Даурен',
];
const LAST_NAMES = [
  'Абенова',
  'Жумабаев',
  'Ким',
  'Сейткали',
  'Нурланова',
  'Ахметов',
  'Ержанова',
  'Ли',
  'Тулегенова',
  'Смагулов',
  'Петрова',
  'Исмаилов',
  'Касымова',
  'Бекова',
  'Оспанов',
  'Иванова',
  'Мусин',
  'Рахимова',
  'Калиев',
  'Садыкова',
];

function phone(i: number) {
  const n = String(1000000 + i * 7919).slice(-7);
  return `+7701${n}`;
}

async function main() {
  if (await prisma.club.findFirst()) {
    const reset = process.argv.includes('--reset');
    const realUsers = await prisma.user.count({ where: { isDemo: false } });
    if (!reset) {
      console.log(
        'Database already contains a club — skipping. Use `npm run db:seed -- --reset` to replace demo data.',
      );
      return;
    }
    if (realUsers > 0) {
      // Never wipe a database that holds anything other than seeded demo records.
      console.error(`Refusing to reset: ${realUsers} non-demo user(s) exist in this database.`);
      process.exit(1);
    }
    const tables = await prisma.$queryRaw<
      { tablename: string }[]
    >`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
    console.log('Removed previous demo data.');
  }

  let password = process.env.SEED_DEMO_PASSWORD ?? '';
  let generated = false;
  if (password.length < 10) {
    password = `Demo-${randomBytes(9).toString('base64url')}7`;
    generated = true;
  }
  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // ───────────── Club & branches ─────────────
  const club = await prisma.club.create({
    data: {
      name: 'FITCLUB',
      settings: {
        ...DEFAULT_CLUB_SETTINGS,
        legalName: 'ТОО «FITCLUB Demo» (вымышленная компания)',
        tagline: lt('Күшіңді бірге құрамыз', 'Сила, которую мы строим вместе', 'Strength, built together'),
        contact: {
          phone: '+7 700 000 00 00',
          email: 'hello@fitclub.test',
          whatsapp: '+7 700 000 00 00',
          instagram: 'fitclub.demo',
          telegram: 'fitclub_demo',
        },
      },
    },
  });

  const branchDefs = [
    {
      slug: 'almaty-dostyk',
      name: lt('FITCLUB Достық', 'FITCLUB Достык', 'FITCLUB Dostyk'),
      city: lt('Алматы', 'Алматы', 'Almaty'),
      address: lt('Спорт көшесі, 12', 'ул. Спортивная, 12', '12 Sportivnaya St'),
      lat: 43.2389,
      lng: 76.9453,
      image: PHOTOS.gymFloor,
    },
    {
      slug: 'almaty-samal',
      name: lt('FITCLUB Самал', 'FITCLUB Самал', 'FITCLUB Samal'),
      city: lt('Алматы', 'Алматы', 'Almaty'),
      address: lt('Чемпиондар көшесі, 5', 'ул. Чемпионов, 5', '5 Chempionov St'),
      lat: 43.2257,
      lng: 76.9583,
      image: PHOTOS.gymBright,
    },
    {
      slug: 'astana-yesil',
      name: lt('FITCLUB Есіл', 'FITCLUB Есиль', 'FITCLUB Yesil'),
      city: lt('Астана', 'Астана', 'Astana'),
      address: lt('Олимпиада көшесі, 21', 'ул. Олимпийская, 21', '21 Olimpiyskaya St'),
      lat: 51.1282,
      lng: 71.4307,
      image: PHOTOS.interior3,
    },
  ];
  const branches = [];
  for (const [i, b] of branchDefs.entries()) {
    branches.push(
      await prisma.branch.create({
        data: {
          clubId: club.id,
          slug: b.slug,
          name: b.name,
          city: b.city,
          address: b.address,
          description: lt(
            'Демо-филиал. Мекенжай ойдан шығарылған.',
            'Демо-филиал. Адрес вымышленный.',
            'Demo branch. The address is fictional.',
          ),
          phone: `+7 700 000 00 0${i + 1}`,
          email: `${b.slug}@fitclub.test`,
          latitude: b.lat,
          longitude: b.lng,
          openingHours: OPENING_HOURS,
          imageUrl: b.image,
          sortOrder: i * 10,
        },
      }),
    );
  }
  const [dostyk, samal, astana] = branches as [(typeof branches)[0], (typeof branches)[0], (typeof branches)[0]];

  const roomDefs = [
    {
      name: lt('Негізгі студия', 'Главная студия', 'Main studio'),
      capacity: 24,
      equipment: lt('Стептер, гантельдер, коврик', 'Степы, гантели, коврики', 'Steps, dumbbells, mats'),
    },
    {
      name: lt('Функционалдық аймақ', 'Функциональная зона', 'Functional zone'),
      capacity: 16,
      equipment: lt('Гирялар, арқандар, TRX', 'Гири, канаты, TRX', 'Kettlebells, ropes, TRX'),
    },
    {
      name: lt('Mind & Body студиясы', 'Студия Mind & Body', 'Mind & Body studio'),
      capacity: 18,
      equipment: lt('Коврик, блоктар, белдіктер', 'Коврики, блоки, ремни', 'Mats, blocks, straps'),
    },
  ];
  const rooms: Record<string, { id: string; capacity: number }[]> = {};
  for (const b of branches) {
    rooms[b.id] = [];
    for (const r of roomDefs) rooms[b.id]!.push(await prisma.room.create({ data: { branchId: b.id, ...r } }));
  }
  rooms[astana.id]!.push(
    await prisma.room.create({
      data: {
        branchId: astana.id,
        name: lt('Бокс залы', 'Зал бокса', 'Boxing room'),
        capacity: 14,
        equipment: lt('Қаптар, қолғаптар', 'Мешки, перчатки', 'Bags, gloves'),
      },
    }),
  );

  // ───────────── Users ─────────────
  async function createUser(params: {
    email: string;
    firstName: string;
    lastName: string;
    phone?: string;
    locale?: string;
    createdAt?: Date;
  }) {
    return prisma.user.create({
      data: {
        email: params.email,
        passwordHash,
        locale: params.locale ?? 'ru',
        emailVerifiedAt: params.createdAt ?? NOW,
        isDemo: true,
        createdAt: params.createdAt,
        profile: {
          create: {
            firstName: params.firstName,
            lastName: params.lastName,
            phone: params.phone,
            notificationPrefs: DEFAULT_NOTIFICATION_PREFS,
            termsAcceptedAt: params.createdAt ?? NOW,
          },
        },
      },
    });
  }

  const staffDefs = [
    {
      email: 'owner@fitclub.test',
      firstName: 'Айгерим',
      lastName: 'Сапарова',
      role: 'OWNER' as const,
      branchId: null,
      title: 'Founder',
    },
    {
      email: 'admin@fitclub.test',
      firstName: 'Нурлан',
      lastName: 'Абдрахманов',
      role: 'ADMIN' as const,
      branchId: null,
      title: 'Club administrator',
    },
    {
      email: 'manager@fitclub.test',
      firstName: 'Жанар',
      lastName: 'Омарова',
      role: 'MANAGER' as const,
      branchId: null,
      title: 'Club manager',
    },
    {
      email: 'reception@fitclub.test',
      firstName: 'Камила',
      lastName: 'Бекова',
      role: 'RECEPTIONIST' as const,
      branchId: dostyk.id,
      title: 'Front desk',
    },
    {
      email: 'reception.astana@fitclub.test',
      firstName: 'Ильяс',
      lastName: 'Мусин',
      role: 'RECEPTIONIST' as const,
      branchId: astana.id,
      title: 'Front desk',
    },
    {
      email: 'sales@fitclub.test',
      firstName: 'Санжар',
      lastName: 'Калиев',
      role: 'SALES' as const,
      branchId: null,
      title: 'Membership advisor',
    },
    {
      email: 'sales2@fitclub.test',
      firstName: 'Милана',
      lastName: 'Рахимова',
      role: 'SALES' as const,
      branchId: samal.id,
      title: 'Membership advisor',
    },
  ];
  const staffUsers: Record<string, { id: string }> = {};
  for (const s of staffDefs) {
    const u = await createUser({
      email: s.email,
      firstName: s.firstName,
      lastName: s.lastName,
      phone: phone(staffDefs.indexOf(s) + 900),
    });
    await prisma.staffMember.create({ data: { userId: u.id, role: s.role, branchId: s.branchId, title: s.title } });
    staffUsers[s.email] = u;
  }
  const owner = staffUsers['owner@fitclub.test']!;

  // ───────────── Trainers ─────────────
  const trainerDefs = [
    {
      slug: 'arman-seitkali',
      name: 'Arman Seitkali',
      first: 'Арман',
      last: 'Сейткали',
      branch: dostyk,
      photo: PHOTOS.trainerA,
      spec: ['Strength', 'Powerlifting'],
      years: 9,
      headline: lt('Күш және кондиция', 'Сила и кондиции', 'Strength & conditioning'),
      email: 'trainer@fitclub.test',
    },
    {
      slug: 'dana-akhmetova',
      name: 'Dana Akhmetova',
      first: 'Дана',
      last: 'Ахметова',
      branch: dostyk,
      photo: PHOTOS.yogaPose,
      spec: ['Yoga', 'Mobility'],
      years: 7,
      headline: lt('Йога және қозғалғыштық', 'Йога и мобильность', 'Yoga & mobility'),
      email: 'trainer2@fitclub.test',
    },
    {
      slug: 'timur-kim',
      name: 'Timur Kim',
      first: 'Тимур',
      last: 'Ким',
      branch: samal,
      photo: PHOTOS.trainerB,
      spec: ['HIIT', 'Functional'],
      years: 6,
      headline: lt('Функционалдық жаттығу', 'Функциональный тренинг', 'Functional & HIIT'),
      email: 'trainer3@fitclub.test',
    },
    {
      slug: 'aliya-nurlanova',
      name: 'Aliya Nurlanova',
      first: 'Алия',
      last: 'Нурланова',
      branch: samal,
      photo: PHOTOS.core,
      spec: ['Pilates', 'Core'],
      years: 8,
      headline: lt('Пилатес және кор', 'Пилатес и кор', 'Pilates & core'),
      email: 'trainer4@fitclub.test',
    },
    {
      slug: 'yerlan-zhumabayev',
      name: 'Yerlan Zhumabayev',
      first: 'Ерлан',
      last: 'Жумабаев',
      branch: astana,
      photo: PHOTOS.trainerC,
      spec: ['Boxing', 'Conditioning'],
      years: 11,
      headline: lt('Бокс', 'Бокс', 'Boxing coach'),
      email: 'trainer5@fitclub.test',
    },
    {
      slug: 'madina-yerzhanova',
      name: 'Madina Yerzhanova',
      first: 'Мадина',
      last: 'Ержанова',
      branch: astana,
      photo: PHOTOS.trainerE,
      spec: ['Cardio', 'Endurance'],
      years: 5,
      headline: lt('Кардио және төзімділік', 'Кардио и выносливость', 'Cardio & endurance'),
      email: 'trainer6@fitclub.test',
    },
    {
      slug: 'viktor-li',
      name: 'Viktor Li',
      first: 'Виктор',
      last: 'Ли',
      branch: dostyk,
      photo: PHOTOS.trainerD,
      spec: ['Kettlebell', 'Strength'],
      years: 10,
      headline: lt('Гиря спорты', 'Гиревой спорт', 'Kettlebell specialist'),
      email: 'trainer7@fitclub.test',
    },
    {
      slug: 'assel-tulegenova',
      name: 'Assel Tulegenova',
      first: 'Асель',
      last: 'Тулегенова',
      branch: samal,
      photo: PHOTOS.groupHands,
      spec: ['Dance', 'Cardio'],
      years: 6,
      headline: lt('Би-кардио', 'Танцевальное кардио', 'Dance cardio'),
      email: 'trainer8@fitclub.test',
    },
  ];
  const trainers = [];
  for (const [i, t] of trainerDefs.entries()) {
    const u = await createUser({ email: t.email, firstName: t.first, lastName: t.last, phone: phone(800 + i) });
    await prisma.staffMember.create({ data: { userId: u.id, role: 'TRAINER', branchId: t.branch.id, title: 'Coach' } });
    staffUsers[t.email] = u;
    trainers.push(
      await prisma.trainer.create({
        data: {
          slug: t.slug,
          userId: u.id,
          branchId: t.branch.id,
          displayName: t.name,
          headline: t.headline,
          bio: lt(
            `${t.years} жыл тәжірибе. Техникаға, қауіпсіздікке және тұрақты прогреске назар аударады. (демо-профиль)`,
            `${t.years} лет опыта. Делает упор на технику, безопасность и стабильный прогресс. (демо-профиль)`,
            `${t.years} years of coaching. Focused on technique, safety and steady progress. (demo profile)`,
          ),
          specializations: t.spec,
          certifications: ['NASM CPT (demo)', 'First Aid'],
          experienceYears: t.years,
          photoUrl: t.photo,
          sortOrder: i * 10,
        },
      }),
    );
    for (const weekday of [0, 2, 4]) {
      await prisma.trainerAvailability.create({
        data: { trainerId: trainers[i]!.id, branchId: t.branch.id, weekday, startMinute: 8 * 60, endMinute: 20 * 60 },
      });
    }
  }

  // ───────────── Plans ─────────────
  const almatyIds = [dostyk.id, samal.id];
  const planDefs: (Omit<Prisma.MembershipPlanCreateInput, 'branches'> & { branchIds?: string[] })[] = [
    {
      code: 'START',
      type: 'MONTHLY',
      name: lt('Start', 'Start', 'Start'),
      description: lt(
        'Тренажер залы, Алматы филиалдары.',
        'Тренажёрный зал в филиалах Алматы.',
        'Gym floor access at the Almaty branches.',
      ),
      features: [
        lt('Тренажер залы', 'Тренажёрный зал', 'Gym floor'),
        lt('Алматы филиалдары', 'Филиалы Алматы', 'Almaty branches'),
        lt('Кіріспе нұсқау', 'Вводный инструктаж', 'Induction session'),
      ],
      price: 22000,
      durationDays: 30,
      visitLimit: null,
      includesClasses: false,
      allBranches: false,
      branchIds: almatyIds,
      freezeMaxDays: 7,
      freezeMaxTimes: 1,
      sortOrder: 10,
    },
    {
      code: 'UNLIMITED',
      type: 'MONTHLY',
      name: lt('Unlimited', 'Unlimited', 'Unlimited'),
      description: lt(
        'Барлық филиалдар және топтық сабақтар.',
        'Все филиалы и групповые занятия.',
        'All branches and every group class.',
      ),
      features: [
        lt('Барлық филиалдар', 'Все филиалы', 'All branches'),
        lt('Шексіз топтық сабақтар', 'Безлимит групповых', 'Unlimited classes'),
        lt('14 күн тоқтату', 'Заморозка 14 дней', '14-day freeze'),
      ],
      price: 32000,
      durationDays: 30,
      visitLimit: null,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 14,
      freezeMaxTimes: 1,
      isFeatured: true,
      sortOrder: 20,
    },
    {
      code: 'QUARTER',
      type: 'CUSTOM',
      name: lt('Quarter', 'Quarter', 'Quarter'),
      description: lt(
        '3 ай барлық мүмкіндікпен.',
        '3 месяца со всеми возможностями.',
        'Three months with everything included.',
      ),
      features: [
        lt('90 күн', '90 дней', '90 days'),
        lt('Барлық сабақтар', 'Все занятия', 'All classes'),
        lt('21 күн тоқтату', 'Заморозка 21 день', '21-day freeze'),
      ],
      price: 84000,
      durationDays: 90,
      visitLimit: null,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 21,
      freezeMaxTimes: 2,
      sortOrder: 30,
    },
    {
      code: 'ANNUAL',
      type: 'ANNUAL',
      name: lt('Annual', 'Annual', 'Annual'),
      description: lt(
        'Ең тиімді: бір жыл, барлық филиал.',
        'Самый выгодный: год во всех филиалах.',
        'Best value: a full year in every branch.',
      ),
      features: [
        lt('365 күн', '365 дней', '365 days'),
        lt('60 күн тоқтату', 'Заморозка 60 дней', '60-day freeze'),
        lt('2 жеке жаттығу', '2 персональные тренировки', '2 personal sessions'),
      ],
      price: 290000,
      durationDays: 365,
      visitLimit: null,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 60,
      freezeMaxTimes: 3,
      sortOrder: 40,
    },
    {
      code: 'PACK12',
      type: 'CUSTOM',
      name: lt('12 келу', '12 посещений', '12 visits'),
      description: lt('45 күн ішінде 12 келу.', '12 посещений за 45 дней.', '12 visits within 45 days.'),
      features: [
        lt('12 келу', '12 посещений', '12 visits'),
        lt('Топтық сабақтар', 'Групповые занятия', 'Group classes'),
        lt('Барлық филиалдар', 'Все филиалы', 'All branches'),
      ],
      price: 20000,
      durationDays: 45,
      visitLimit: 12,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 0,
      freezeMaxTimes: 0,
      sortOrder: 50,
    },
    {
      code: 'STUDENT',
      type: 'STUDENT',
      name: lt('Студенттік', 'Студенческий', 'Student'),
      description: lt(
        'Студенттік билетпен, ресепшенде рәсімделеді.',
        'По студенческому билету, оформляется на ресепшене.',
        'With a valid student ID, issued at reception.',
      ),
      features: [
        lt('Алматы филиалдары', 'Филиалы Алматы', 'Almaty branches'),
        lt('Топтық сабақтар', 'Групповые занятия', 'Group classes'),
      ],
      price: 16000,
      durationDays: 30,
      visitLimit: null,
      includesClasses: true,
      allBranches: false,
      branchIds: almatyIds,
      requiresStudentId: true,
      freezeMaxDays: 0,
      freezeMaxTimes: 0,
      sortOrder: 60,
    },
    {
      code: 'TRIAL',
      type: 'TRIAL',
      name: lt('Сынақ', 'Пробный', 'Trial'),
      description: lt('3 күн тегін, бір рет.', '3 дня бесплатно, один раз.', 'Three days free, once per person.'),
      features: [lt('3 күн', '3 дня', '3 days'), lt('3 келу', '3 посещения', '3 visits')],
      price: 0,
      durationDays: 3,
      visitLimit: 3,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 0,
      freezeMaxTimes: 0,
      sortOrder: 5,
    },
    {
      code: 'LEGACY-MONTH',
      type: 'MONTHLY',
      name: lt('Ескі айлық (2025)', 'Месячный (архив 2025)', 'Monthly (2025, archived)'),
      description: lt('Мұрағат тарифі.', 'Архивный тариф.', 'Archived plan kept for history.'),
      features: [],
      price: 18000,
      durationDays: 30,
      visitLimit: null,
      includesClasses: true,
      allBranches: true,
      freezeMaxDays: 7,
      freezeMaxTimes: 1,
      status: 'ARCHIVED',
      isPublic: false,
      sortOrder: 99,
    },
  ];
  const plans: Record<string, MembershipPlan & { branches: { branchId: string }[] }> = {};
  for (const { branchIds, ...p } of planDefs) {
    plans[p.code] = await prisma.membershipPlan.create({
      data: { ...p, branches: branchIds ? { create: branchIds.map((branchId) => ({ branchId })) } : undefined },
      include: { branches: { select: { branchId: true } } },
    });
  }

  // ───────────── Promotions ─────────────
  const promos = {
    welcome: await prisma.promotion.create({
      data: {
        code: 'WELCOME10',
        name: lt('Жаңа мүшелерге −10%', '−10% для новых участников', '10% off for new members'),
        description: lt('Алғашқы абонементке.', 'На первый абонемент.', 'On your first membership.'),
        type: 'PERCENT',
        value: 10,
        newMembersOnly: true,
        perMemberLimit: 1,
        isPublic: true,
        imageUrl: PHOTOS.groupMat,
      },
    }),
    friend: await prisma.promotion.create({
      data: {
        code: 'FRIEND5000',
        name: lt('Дос әкел — 5000 ₸', 'Приведи друга — 5000 ₸', 'Bring a friend — 5,000 ₸'),
        description: lt(
          'Unlimited және Quarter тарифтеріне.',
          'Для тарифов Unlimited и Quarter.',
          'For Unlimited and Quarter plans.',
        ),
        type: 'FIXED',
        value: 5000,
        maxRedemptions: 200,
        perMemberLimit: 1,
        planIds: [plans.UNLIMITED!.id, plans.QUARTER!.id],
        isPublic: true,
        imageUrl: PHOTOS.groupHands,
      },
    }),
    autumn: await prisma.promotion.create({
      data: {
        code: 'AUTUMN15',
        name: lt('Күзгі ұсыныс −15%', 'Осеннее предложение −15%', 'Autumn offer −15%'),
        description: lt(
          'Quarter және Annual тарифтеріне.',
          'На тарифы Quarter и Annual.',
          'On Quarter and Annual plans.',
        ),
        type: 'PERCENT',
        value: 15,
        validFrom: daysAgo(20, 0),
        validUntil: zonedDateTime(addDaysToKey(TODAY, 30)),
        planIds: [plans.QUARTER!.id, plans.ANNUAL!.id],
        isPublic: true,
        imageUrl: PHOTOS.yogaGroup,
      },
    }),
    paused: await prisma.promotion.create({
      data: {
        code: 'STUDENTDAY',
        name: lt('Студент күні', 'День студента', 'Student day'),
        description: lt('Тоқтатылған акция.', 'Приостановленная акция.', 'Paused campaign.'),
        type: 'PERCENT',
        value: 20,
        status: 'PAUSED',
      },
    }),
  };

  // ───────────── Class catalog & schedules ─────────────
  const cats: Record<string, { id: string }> = {};
  for (const [i, c] of [
    ['strength', lt('Күш', 'Сила', 'Strength')],
    ['cardio', lt('Кардио', 'Кардио', 'Cardio')],
    ['mind-body', lt('Mind & Body', 'Mind & Body', 'Mind & Body')],
    ['combat', lt('Жекпе-жек', 'Единоборства', 'Combat')],
    ['dance', lt('Би', 'Танцы', 'Dance')],
  ].entries()) {
    cats[c[0] as string] = await prisma.classCategory.create({
      data: { slug: c[0] as string, name: c[1] as LocalizedText, sortOrder: i * 10 },
    });
  }
  const typeDefs = [
    {
      slug: 'functional-strength',
      cat: 'strength',
      name: lt('Функционалдық күш', 'Функциональная сила', 'Functional Strength'),
      diff: 'ALL_LEVELS',
      dur: 55,
      cap: 16,
      int: 4,
      image: PHOTOS.ropes,
    },
    {
      slug: 'barbell-club',
      cat: 'strength',
      name: lt('Barbell Club', 'Barbell Club', 'Barbell Club'),
      diff: 'INTERMEDIATE',
      dur: 60,
      cap: 12,
      int: 4,
      image: PHOTOS.deadlift2,
    },
    {
      slug: 'kettlebell-flow',
      cat: 'strength',
      name: lt('Kettlebell Flow', 'Kettlebell Flow', 'Kettlebell Flow'),
      diff: 'INTERMEDIATE',
      dur: 45,
      cap: 14,
      int: 4,
      image: PHOTOS.barbellGrip,
    },
    {
      slug: 'hiit-burn',
      cat: 'cardio',
      name: lt('HIIT Burn', 'HIIT Burn', 'HIIT Burn'),
      diff: 'ADVANCED',
      dur: 45,
      cap: 20,
      int: 5,
      image: PHOTOS.pushups,
    },
    {
      slug: 'cardio-row',
      cat: 'cardio',
      name: lt('Row & Ride', 'Row & Ride', 'Row & Ride'),
      diff: 'ALL_LEVELS',
      dur: 45,
      cap: 16,
      int: 4,
      image: PHOTOS.rowing,
    },
    {
      slug: 'yoga-flow',
      cat: 'mind-body',
      name: lt('Йога Flow', 'Йога Flow', 'Yoga Flow'),
      diff: 'ALL_LEVELS',
      dur: 60,
      cap: 18,
      int: 2,
      image: PHOTOS.yogaFloor,
    },
    {
      slug: 'pilates-core',
      cat: 'mind-body',
      name: lt('Пилатес Core', 'Пилатес Core', 'Pilates Core'),
      diff: 'BEGINNER',
      dur: 50,
      cap: 18,
      int: 3,
      image: PHOTOS.core,
    },
    {
      slug: 'stretch-mobility',
      cat: 'mind-body',
      name: lt('Созылу және мобильділік', 'Растяжка и мобильность', 'Stretch & Mobility'),
      diff: 'BEGINNER',
      dur: 45,
      cap: 18,
      int: 1,
      image: PHOTOS.stretch,
    },
    {
      slug: 'boxing-fit',
      cat: 'combat',
      name: lt('Boxing Fit', 'Boxing Fit', 'Boxing Fit'),
      diff: 'INTERMEDIATE',
      dur: 60,
      cap: 14,
      int: 5,
      image: PHOTOS.pullup,
    },
    {
      slug: 'dance-cardio',
      cat: 'dance',
      name: lt('Dance Cardio', 'Dance Cardio', 'Dance Cardio'),
      diff: 'ALL_LEVELS',
      dur: 50,
      cap: 22,
      int: 3,
      image: PHOTOS.groupMat,
    },
  ] as const;
  const types: Record<string, { id: string; durationMinutes: number; defaultCapacity: number }> = {};
  for (const t of typeDefs) {
    types[t.slug] = await prisma.classType.create({
      data: {
        slug: t.slug,
        categoryId: cats[t.cat]!.id,
        name: t.name,
        summary: lt(
          'Демо-сабақ: құрылымды жаттығу, барлық деңгейге бейімделеді.',
          'Демо-занятие: структурированная тренировка, адаптируется под уровень.',
          'Demo class: a structured session that scales to your level.',
        ),
        description: lt(
          'Жылыту, негізгі бөлім және салқындату. Жаттықтырушы жүктемені деңгейіңізге қарай бейімдейді.',
          'Разминка, основная часть и заминка. Тренер подберёт нагрузку под ваш уровень.',
          'Warm-up, main block and cool-down. Your coach scales every exercise to your level.',
        ),
        difficulty: t.diff,
        durationMinutes: t.dur,
        defaultCapacity: t.cap,
        intensity: t.int,
        imageUrl: t.image,
      },
    });
  }

  const T = (slug: string) => trainers.find((t) => t.slug === slug)!;
  const scheduleDefs: [string, string, typeof dostyk, number, number[], string][] = [
    // [classType, trainer, branch, roomIndex, weekdays, time]
    ['functional-strength', 'arman-seitkali', dostyk, 1, [0, 2, 4], '07:00'],
    ['barbell-club', 'arman-seitkali', dostyk, 1, [1, 3], '19:00'],
    ['kettlebell-flow', 'viktor-li', dostyk, 1, [1, 3, 5], '08:00'],
    ['yoga-flow', 'dana-akhmetova', dostyk, 2, [0, 2, 4, 6], '09:00'],
    ['stretch-mobility', 'dana-akhmetova', dostyk, 2, [1, 3], '20:00'],
    ['hiit-burn', 'viktor-li', dostyk, 0, [0, 2], '19:00'],
    ['hiit-burn', 'timur-kim', samal, 0, [1, 3, 5], '07:30'],
    ['functional-strength', 'timur-kim', samal, 1, [0, 2, 4], '18:30'],
    ['pilates-core', 'aliya-nurlanova', samal, 2, [0, 2, 4], '10:00'],
    ['pilates-core', 'aliya-nurlanova', samal, 2, [1, 3], '19:30'],
    ['dance-cardio', 'assel-tulegenova', samal, 0, [1, 3, 6], '18:00'],
    ['boxing-fit', 'yerlan-zhumabayev', astana, 3, [0, 2, 4], '19:00'],
    ['boxing-fit', 'yerlan-zhumabayev', astana, 3, [5], '11:00'],
    ['cardio-row', 'madina-yerzhanova', astana, 0, [1, 3], '07:00'],
    ['hiit-burn', 'madina-yerzhanova', astana, 0, [0, 4], '18:00'],
    ['stretch-mobility', 'madina-yerzhanova', astana, 2, [6], '10:00'],
  ];
  const schedules = [];
  for (const [typeSlug, trainerSlug, branch, roomIdx, weekdays, time] of scheduleDefs) {
    const [h, m] = time.split(':').map(Number) as [number, number];
    const room = rooms[branch.id]![roomIdx]!;
    const type = types[typeSlug]!;
    for (const weekday of weekdays) {
      schedules.push(
        await prisma.classSchedule.create({
          data: {
            classTypeId: type.id,
            trainerId: T(trainerSlug).id,
            roomId: room.id,
            branchId: branch.id,
            weekday,
            startMinute: h * 60 + m,
            durationMinutes: type.durationMinutes,
            capacity: Math.min(type.defaultCapacity, room.capacity),
            validFrom: dbDate(addDaysToKey(TODAY, -70)),
          },
        }),
      );
    }
  }

  // ───────────── Members & memberships ─────────────
  interface SeedMember {
    id: string;
    userId: string;
    branchId: string;
    membership: {
      id: string;
      status: string;
      startsAt: Date;
      endsAt: Date;
      includesClasses: boolean;
      allBranches: boolean;
      branchIds: string[];
      visitLimit: number | null;
    } | null;
  }
  const members: SeedMember[] = [];

  async function sell(params: {
    memberId: string;
    plan: MembershipPlan & { branches: { branchId: string }[] };
    startKey: string;
    status: 'ACTIVE' | 'FROZEN' | 'EXPIRED' | 'CANCELLED' | 'PENDING';
    method: PaymentMethod;
    soldById?: string;
    promotion?: { id: string; type: 'PERCENT' | 'FIXED'; value: number } | null;
  }) {
    const { plan } = params;
    const period = computeMembershipPeriod(params.startKey, plan.durationDays);
    const discount = params.promotion
      ? params.promotion.type === 'PERCENT'
        ? Math.floor((plan.price * params.promotion.value) / 100)
        : Math.min(plan.price, params.promotion.value)
      : 0;
    const price = plan.price - discount;
    const branchIds = plan.branches.map((b) => b.branchId);
    const activatedAt =
      params.status === 'PENDING' ? null : new Date(period.startsAt.getTime() + int(1, 10) * 3_600_000);
    const membership = await prisma.membership.create({
      data: {
        memberId: params.memberId,
        planId: plan.id,
        status: params.status,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        planSnapshot: {
          code: plan.code,
          name: plan.name,
          type: plan.type,
          durationDays: plan.durationDays,
          price: plan.price,
          visitLimit: plan.visitLimit,
          includesClasses: plan.includesClasses,
          allBranches: plan.allBranches,
          branchIds,
          freezeMaxDays: plan.freezeMaxDays,
          freezeMaxTimes: plan.freezeMaxTimes,
          version: plan.version,
        },
        planVersion: plan.version,
        price,
        visitLimit: plan.visitLimit,
        includesClasses: plan.includesClasses,
        allBranches: plan.allBranches,
        branchIds,
        freezeMaxDays: plan.freezeMaxDays,
        freezeMaxTimes: plan.freezeMaxTimes,
        activatedAt,
        expiredAt: params.status === 'EXPIRED' ? period.endsAt : null,
        cancelledAt: params.status === 'CANCELLED' ? new Date(period.startsAt.getTime() + 5 * 86_400_000) : null,
        cancelReason: params.status === 'CANCELLED' ? 'Relocated to another city (demo)' : null,
        soldById: params.soldById,
        isDemo: true,
        createdAt: new Date(period.startsAt.getTime() - 3_600_000),
      },
    });
    await prisma.membershipEvent.create({
      data: {
        membershipId: membership.id,
        type: 'CREATED',
        actorId: params.soldById,
        createdAt: membership.createdAt,
        data: { planCode: plan.code, price },
      },
    });
    if (activatedAt)
      await prisma.membershipEvent.create({
        data: { membershipId: membership.id, type: 'ACTIVATED', createdAt: activatedAt },
      });
    if (params.status === 'EXPIRED')
      await prisma.membershipEvent.create({
        data: { membershipId: membership.id, type: 'EXPIRED', createdAt: period.endsAt },
      });
    if (params.status === 'CANCELLED')
      await prisma.membershipEvent.create({
        data: {
          membershipId: membership.id,
          type: 'CANCELLED',
          actorId: owner.id,
          createdAt: membership.cancelledAt!,
          data: { reason: membership.cancelReason },
        },
      });

    const paid = params.status !== 'PENDING';
    const payment = await prisma.payment.create({
      data: {
        memberId: params.memberId,
        membershipId: membership.id,
        purpose: 'MEMBERSHIP_PURCHASE',
        provider: params.method === 'ONLINE' ? 'SANDBOX' : 'MANUAL',
        method: params.method,
        status: paid ? 'SUCCEEDED' : 'REQUIRES_ACTION',
        amount: price,
        subtotal: plan.price,
        discount,
        promotionId: params.promotion?.id,
        idempotencyKey: randomBytes(12).toString('hex'),
        providerRef: params.method === 'ONLINE' ? `sbx_seed_${randomBytes(6).toString('hex')}` : null,
        isTest: true,
        recordedById: params.method === 'ONLINE' ? null : params.soldById,
        reconciliationStatus: paid && chance(0.6) ? 'MATCHED' : 'UNRECONCILED',
        paidAt: activatedAt,
        expiresAt: paid ? null : new Date(NOW.getTime() + 20 * 60_000),
        createdAt: membership.createdAt,
        metadata: { planName: plan.name, seeded: true },
      },
    });
    if (paid) {
      const invoice = await prisma.invoice.create({
        data: {
          number: `TMP-${payment.id}`,
          paymentId: payment.id,
          memberId: params.memberId,
          items: [{ description: plan.name, purpose: 'MEMBERSHIP_PURCHASE', quantity: 1, unitPrice: plan.price }],
          subtotal: plan.price,
          discount,
          total: price,
          issuedAt: activatedAt!,
        },
      });
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { number: `FC-${activatedAt!.getUTCFullYear()}-${String(invoice.seq).padStart(6, '0')}` },
      });
      if (params.promotion && discount > 0) {
        await prisma.promotionRedemption.create({
          data: {
            promotionId: params.promotion.id,
            memberId: params.memberId,
            paymentId: payment.id,
            discount,
            createdAt: activatedAt!,
          },
        });
        await prisma.promotion.update({
          where: { id: params.promotion.id },
          data: { redemptionCount: { increment: 1 } },
        });
      }
    }
    return { membership, payment };
  }

  const salesActors = [
    staffUsers['reception@fitclub.test']!.id,
    staffUsers['sales@fitclub.test']!.id,
    staffUsers['reception.astana@fitclub.test']!.id,
    staffUsers['manager@fitclub.test']!.id,
  ];
  const methods: PaymentMethod[] = ['CARD_TERMINAL', 'CARD_TERMINAL', 'CASH', 'ONLINE', 'BANK_TRANSFER'];

  // The demo member used in docs and E2E tests.
  {
    const u = await createUser({
      email: 'member@fitclub.test',
      firstName: 'Алина',
      lastName: 'Демо',
      phone: '+77011234567',
      createdAt: daysAgo(40),
    });
    const m = await prisma.member.create({
      data: {
        userId: u.id,
        homeBranchId: dostyk.id,
        assignedTrainerId: T('arman-seitkali').id,
        isDemo: true,
        createdAt: daysAgo(40),
      },
    });
    const old = await sell({
      memberId: m.id,
      plan: plans.START!,
      startKey: addDaysToKey(TODAY, -40),
      status: 'EXPIRED',
      method: 'CARD_TERMINAL',
      soldById: salesActors[0],
    });
    void old;
    const { membership } = await sell({
      memberId: m.id,
      plan: plans.UNLIMITED!,
      startKey: addDaysToKey(TODAY, -10),
      status: 'ACTIVE',
      method: 'ONLINE',
      promotion: null,
    });
    members.push({ id: m.id, userId: u.id, branchId: dostyk.id, membership });
  }

  const statuses = [
    ...Array<string>(34).fill('ACTIVE'),
    ...Array<string>(5).fill('FROZEN'),
    ...Array<string>(10).fill('EXPIRED'),
    ...Array<string>(3).fill('PENDING'),
    ...Array<string>(2).fill('CANCELLED'),
    ...Array<string>(6).fill('NONE'),
  ];
  for (const [i, status] of statuses.entries()) {
    const branch = i % 5 === 0 ? astana : i % 2 === 0 ? samal : dostyk;
    const joinedDaysAgo = int(5, 150);
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    const u = await createUser({
      email: `member${String(i + 1).padStart(2, '0')}@fitclub.test`,
      firstName: first,
      lastName: last,
      phone: phone(i + 1),
      locale: pick(['ru', 'ru', 'kk', 'en']),
      createdAt: daysAgo(joinedDaysAgo),
    });
    const trainer = chance(0.35) ? pick(trainers.filter((t) => t.branchId === branch.id)) : null;
    const m = await prisma.member.create({
      data: {
        userId: u.id,
        homeBranchId: branch.id,
        assignedTrainerId: trainer?.id,
        isDemo: true,
        createdAt: daysAgo(joinedDaysAgo),
      },
    });
    let current: SeedMember['membership'] = null;
    if (status !== 'NONE') {
      const plan =
        status === 'EXPIRED'
          ? pick([plans.START!, plans.UNLIMITED!, plans.PACK12!, plans['LEGACY-MONTH']!])
          : branch.id === astana.id
            ? pick([plans.UNLIMITED!, plans.UNLIMITED!, plans.QUARTER!, plans.ANNUAL!, plans.PACK12!])
            : pick([
                plans.START!,
                plans.UNLIMITED!,
                plans.UNLIMITED!,
                plans.QUARTER!,
                plans.ANNUAL!,
                plans.PACK12!,
                plans.STUDENT!,
              ]);
      const maxBack =
        status === 'EXPIRED'
          ? plan.durationDays + int(2, 40)
          : Math.max(1, Math.min(plan.durationDays - 2, joinedDaysAgo));
      const startBack = status === 'EXPIRED' ? maxBack : status === 'PENDING' ? 0 : int(0, maxBack);
      const promotion =
        chance(0.2) && plan.code !== 'STUDENT'
          ? pick([
              { ...promos.welcome, type: 'PERCENT' as const },
              ...(promos.friend.planIds.includes(plan.id) ? [{ ...promos.friend, type: 'FIXED' as const }] : []),
            ])
          : null;
      const sold = await sell({
        memberId: m.id,
        plan,
        startKey: addDaysToKey(TODAY, -startBack),
        status: status as 'ACTIVE',
        method: pick(methods),
        soldById: pick(salesActors),
        promotion,
      });
      current = sold.membership;
      if (status === 'FROZEN' && plan.freezeMaxDays > 0) {
        const days = Math.min(plan.freezeMaxDays, 14);
        const startKey = addDaysToKey(TODAY, -int(1, 5));
        await prisma.membershipFreeze.create({
          data: {
            membershipId: current.id,
            startDate: dbDate(startKey),
            endDate: dbDate(addDaysToKey(startKey, days)),
            days,
            status: 'ACTIVE',
            reason: 'Business trip (demo)',
            createdById: u.id,
          },
        });
        await prisma.membership.update({
          where: { id: current.id },
          data: {
            endsAt: new Date(current.endsAt.getTime() + days * 86_400_000),
            frozenDaysUsed: days,
            freezeCount: 1,
          },
        });
        await prisma.membershipEvent.create({ data: { membershipId: current.id, type: 'FROZEN', data: { days } } });
      } else if (status === 'FROZEN') {
        await prisma.membership.update({ where: { id: current.id }, data: { status: 'ACTIVE' } });
        current = { ...current, status: 'ACTIVE' };
      }
      // A few renewals for the renewal-rate report.
      // Deterministic pick (every 5th member) keeps the report stable across seeds.
      const renew = status === 'ACTIVE' && plan.type !== 'TRIAL' && i % 5 === 1;
      if (renew) {
        const renewedAt = daysAgo(int(1, 20), 12 * 60);
        const renewal = await prisma.payment.create({
          data: {
            memberId: m.id,
            membershipId: current.id,
            purpose: 'MEMBERSHIP_RENEWAL',
            provider: 'MANUAL',
            method: 'CARD_TERMINAL',
            status: 'SUCCEEDED',
            amount: plan.price,
            subtotal: plan.price,
            idempotencyKey: randomBytes(12).toString('hex'),
            isTest: true,
            recordedById: pick(salesActors),
            paidAt: renewedAt,
            createdAt: renewedAt,
            metadata: { renewDays: plan.durationDays, planName: plan.name, seeded: true },
          },
        });
        const invoice = await prisma.invoice.create({
          data: {
            number: `TMP-${renewal.id}`,
            paymentId: renewal.id,
            memberId: m.id,
            items: [{ description: plan.name, purpose: 'MEMBERSHIP_RENEWAL', quantity: 1, unitPrice: plan.price }],
            subtotal: plan.price,
            discount: 0,
            total: plan.price,
            issuedAt: renewedAt,
          },
        });
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { number: `FC-${renewedAt.getUTCFullYear()}-${String(invoice.seq).padStart(6, '0')}` },
        });
        const endsAt = new Date(current.endsAt.getTime() + plan.durationDays * 86_400_000);
        await prisma.membership.update({ where: { id: current.id }, data: { endsAt } });
        await prisma.membershipEvent.create({
          data: {
            membershipId: current.id,
            type: 'RENEWED',
            createdAt: renewedAt,
            data: { days: plan.durationDays, paymentId: renewal.id },
          },
        });
        current = { ...current, endsAt };
      }
    }
    members.push({ id: m.id, userId: u.id, branchId: branch.id, membership: current });
  }

  // One refund for the payments report.
  const refundable = await prisma.payment.findFirst({
    where: { status: 'SUCCEEDED', amount: { gt: 10000 }, membership: { status: 'CANCELLED' } },
  });
  if (refundable) {
    await prisma.refund.create({
      data: {
        paymentId: refundable.id,
        amount: Math.floor(refundable.amount / 2),
        reason: 'Partial refund after relocation (demo)',
        createdById: owner.id,
        createdAt: daysAgo(3),
      },
    });
    await prisma.payment.update({ where: { id: refundable.id }, data: { status: 'PARTIALLY_REFUNDED' } });
  }

  // ───────────── Sessions, bookings, attendance ─────────────
  const usable = (m: SeedMember, at: Date, branchId: string) =>
    m.membership !== null &&
    (m.membership.status === 'ACTIVE' || (m.membership.status === 'EXPIRED' && at < m.membership.endsAt)) &&
    m.membership.includesClasses &&
    at >= m.membership.startsAt &&
    at < m.membership.endsAt &&
    (m.membership.allBranches || m.membership.branchIds.includes(branchId));

  const memberBusy = new Map<string, { s: number; e: number }[]>();
  const fits = (memberId: string, s: number, e: number) =>
    !(memberBusy.get(memberId) ?? []).some((x) => x.s < e && s < x.e);
  const occupy = (memberId: string, s: number, e: number) =>
    memberBusy.set(memberId, [...(memberBusy.get(memberId) ?? []), { s, e }]);

  const demoMember = members[0]!;
  let demoUpcoming = 0;
  for (let offset = -42; offset <= 21; offset++) {
    const key = addDaysToKey(TODAY, offset);
    const weekday = localWeekday(zonedDateTime(key, 12 * 60));
    for (const sch of schedules.filter((s) => s.weekday === weekday)) {
      const startsAt = zonedDateTime(key, sch.startMinute);
      const endsAt = new Date(startsAt.getTime() + sch.durationMinutes * 60_000);
      const past = endsAt < NOW;
      const cancelled = past && chance(0.02);
      const candidates = members.filter(
        (m) => usable(m, startsAt, sch.branchId) && fits(m.id, startsAt.getTime(), endsAt.getTime()),
      );
      const fillTarget = cancelled
        ? 0
        : Math.round(sch.capacity * (past ? 0.4 + rand() * 0.55 : offset <= 3 ? 0.3 + rand() * 0.7 : rand() * 0.4));
      const chosen: SeedMember[] = [];
      // Make sure the demo member has a few upcoming classes and a booking history.
      if (
        demoMember &&
        sch.branchId === dostyk.id &&
        candidates.includes(demoMember) &&
        ((past && chance(0.25)) || (!past && demoUpcoming < 3 && offset >= 1 && chance(0.5)))
      ) {
        chosen.push(demoMember);
        if (!past) demoUpcoming += 1;
      }
      for (const c of candidates.sort(() => rand() - 0.5)) {
        if (chosen.length >= Math.min(fillTarget, sch.capacity)) break;
        if (c === demoMember) continue;
        chosen.push(c);
      }
      const session = await prisma.classSession.create({
        data: {
          classTypeId: sch.classTypeId,
          scheduleId: sch.id,
          trainerId: sch.trainerId,
          roomId: sch.roomId,
          branchId: sch.branchId,
          startsAt,
          endsAt,
          capacity: sch.capacity,
          bookedCount: cancelled ? 0 : chosen.length,
          status: cancelled ? 'CANCELLED' : past ? 'COMPLETED' : 'SCHEDULED',
          cancelReason: cancelled ? 'Coach illness (demo)' : null,
          cancelledAt: cancelled ? new Date(startsAt.getTime() - 3 * 3_600_000) : null,
          reminderSentAt: past ? startsAt : null,
        },
      });
      if (chosen.length === 0) continue;
      await prisma.booking.createMany({
        data: chosen.map((m) => {
          occupy(m.id, startsAt.getTime(), endsAt.getTime());
          const attended = past ? chance(0.86) : false;
          return {
            sessionId: session.id,
            memberId: m.id,
            membershipId: m.membership!.id,
            status: past ? (attended ? 'ATTENDED' : 'NO_SHOW') : 'CONFIRMED',
            attendedAt: attended ? new Date(startsAt.getTime() + 5 * 60_000) : null,
            createdAt: new Date(startsAt.getTime() - int(6, 120) * 3_600_000),
          } as const;
        }),
      });
      // A handful of late cancellations for the attendance report.
      if (past && chance(0.15)) {
        const extra = candidates.find((c) => !chosen.includes(c));
        if (extra)
          await prisma.booking.create({
            data: {
              sessionId: session.id,
              memberId: extra.id,
              membershipId: extra.membership!.id,
              status: 'LATE_CANCELLED',
              cancelledAt: new Date(startsAt.getTime() - 2 * 3_600_000),
            },
          });
      }
      // Full upcoming sessions get a waitlist.
      if (!past && chosen.length >= sch.capacity) {
        const waiting = candidates.filter((c) => !chosen.includes(c)).slice(0, 2);
        for (const w of waiting) await prisma.waitlistEntry.create({ data: { sessionId: session.id, memberId: w.id } });
      }
    }
  }

  // ───────────── Check-ins (visits) ─────────────
  const staffForBranch: Record<string, string> = {
    [dostyk.id]: staffUsers['reception@fitclub.test']!.id,
    [samal.id]: staffUsers['sales2@fitclub.test']!.id,
    [astana.id]: staffUsers['reception.astana@fitclub.test']!.id,
  };
  for (const m of members) {
    const ms = m.membership;
    if (!ms || ms.status === 'PENDING' || ms.status === 'CANCELLED') continue;
    let visits = 0;
    for (let d = 45; d >= 0; d--) {
      const key = addDaysToKey(TODAY, -d);
      const at = zonedDateTime(key, int(7 * 60, 21 * 60));
      if (at > NOW || at < ms.startsAt || at >= ms.endsAt) continue;
      if (ms.status === 'FROZEN' && d < 5) continue;
      if (!chance(m === demoMember ? 0.45 : 0.33)) continue;
      if (ms.visitLimit !== null && visits >= ms.visitLimit) break;
      const branchId = ms.allBranches && chance(0.15) ? pick(branches).id : m.branchId;
      if (!ms.allBranches && !ms.branchIds.includes(branchId)) continue;
      await prisma.checkIn.create({
        data: {
          memberId: m.id,
          membershipId: ms.id,
          branchId,
          staffId: staffForBranch[branchId]!,
          method: chance(0.7) ? 'QR' : 'SEARCH',
          status: 'ACCEPTED',
          localDate: dbDate(key),
          createdAt: at,
        },
      });
      visits += 1;
    }
    if (visits > 0) await prisma.membership.update({ where: { id: ms.id }, data: { visitsUsed: visits } });
  }
  // A couple of rejected attempts (expired memberships) so reception history looks real.
  for (const m of members.filter((x) => x.membership?.status === 'EXPIRED').slice(0, 3)) {
    const at = daysAgo(int(0, 3), int(8 * 60, 20 * 60));
    if (at > NOW) continue;
    await prisma.checkIn.create({
      data: {
        memberId: m.id,
        membershipId: m.membership!.id,
        branchId: m.branchId,
        staffId: staffForBranch[m.branchId]!,
        method: 'SEARCH',
        status: 'REJECTED',
        rejectReason: 'EXPIRED',
        localDate: dbDate(localDateKey(at)),
        createdAt: at,
      },
    });
  }

  // ───────────── Leads ─────────────
  const leadStatuses = [
    'NEW',
    'NEW',
    'NEW',
    'CONTACTED',
    'CONTACTED',
    'TRIAL_SCHEDULED',
    'NEGOTIATION',
    'WON',
    'LOST',
  ] as const;
  const sources = [
    'WEBSITE_CONTACT',
    'TRIAL_REQUEST',
    'TRIAL_REQUEST',
    'WALK_IN',
    'PHONE',
    'REFERRAL',
    'SOCIAL',
  ] as const;
  const assignees = [
    staffUsers['sales@fitclub.test']!.id,
    staffUsers['sales2@fitclub.test']!.id,
    staffUsers['manager@fitclub.test']!.id,
    null,
  ];
  for (let i = 0; i < 32; i++) {
    const status = pick(leadStatuses);
    const createdAt = daysAgo(int(0, 60), int(9 * 60, 21 * 60));
    const first = pick(FIRST_NAMES);
    const assignedToId = status === 'NEW' && chance(0.5) ? null : pick(assignees);
    const converted = status === 'WON' ? members[int(1, members.length - 1)]! : null;
    const lead = await prisma.lead.create({
      data: {
        name: `${first} ${pick(LAST_NAMES)}`,
        email: chance(0.7) ? `lead${i + 1}@example.com` : null,
        phone: phone(500 + i),
        source: pick(sources),
        status,
        branchId: pick(branches).id,
        interest: pick(['Unlimited', 'Annual', 'Yoga', 'Boxing', 'Personal training', 'Trial']),
        message: chance(0.5)
          ? pick([
              'Хочу попробовать групповые занятия',
              'Интересует годовой абонемент',
              'Сынақ сабағына жазылғым келеді',
              'Looking for a gym near work',
            ])
          : null,
        assignedToId,
        consentAt: createdAt,
        lostReason: status === 'LOST' ? pick(['Price', 'Too far', 'Chose another club']) : null,
        convertedMemberId: converted?.id,
        convertedAt: converted ? new Date(createdAt.getTime() + 3 * 86_400_000) : null,
        isDemo: true,
        createdAt,
      },
    });
    await prisma.leadActivity.create({
      data: { leadId: lead.id, type: 'NOTE', body: 'Lead created (demo)', createdAt },
    });
    if (status !== 'NEW')
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'CALL',
          body: 'Discussed plans and schedule.',
          actorId: assignedToId,
          createdAt: new Date(createdAt.getTime() + 86_400_000),
        },
      });
    if (['CONTACTED', 'TRIAL_SCHEDULED', 'NEGOTIATION', 'NEW'].includes(status) && chance(0.6)) {
      const due = new Date(NOW.getTime() + int(-3, 5) * 86_400_000);
      await prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          type: 'TASK',
          body: 'Follow up by phone',
          dueAt: due,
          actorId: assignedToId,
          createdAt,
        },
      });
    }
  }

  // ───────────── Training ─────────────
  const exerciseDefs: [
    LocalizedText,
    'STRENGTH' | 'CARDIO' | 'MOBILITY' | 'CORE' | 'PLYOMETRIC' | 'RECOVERY',
    string[],
    string,
  ][] = [
    [lt('Штангамен отыру', 'Приседания со штангой', 'Back squat'), 'STRENGTH', ['quads', 'glutes'], 'Barbell'],
    [lt('Өлі тарту', 'Становая тяга', 'Deadlift'), 'STRENGTH', ['hamstrings', 'back'], 'Barbell'],
    [lt('Жатып итеру', 'Жим лёжа', 'Bench press'), 'STRENGTH', ['chest', 'triceps'], 'Barbell'],
    [lt('Тартылу', 'Подтягивания', 'Pull-up'), 'STRENGTH', ['back', 'biceps'], 'Bar'],
    [lt('Гантельмен итеру', 'Жим гантелей сидя', 'Seated dumbbell press'), 'STRENGTH', ['shoulders'], 'Dumbbells'],
    [lt('Румын тартуы', 'Румынская тяга', 'Romanian deadlift'), 'STRENGTH', ['hamstrings'], 'Barbell'],
    [lt('Гиря сермеу', 'Махи гирей', 'Kettlebell swing'), 'PLYOMETRIC', ['glutes', 'core'], 'Kettlebell'],
    [lt('Шабуыл', 'Выпады', 'Walking lunge'), 'STRENGTH', ['quads', 'glutes'], 'Dumbbells'],
    [lt('Планка', 'Планка', 'Plank'), 'CORE', ['core'], ''],
    [lt('Ескек тренажері', 'Гребной тренажёр', 'Row erg'), 'CARDIO', ['full body'], 'Rower'],
    [lt('Берпи', 'Бёрпи', 'Burpee'), 'PLYOMETRIC', ['full body'], ''],
    [lt('Жамбас көпірі', 'Ягодичный мост', 'Hip thrust'), 'STRENGTH', ['glutes'], 'Barbell'],
    [lt('Мысық-сиыр', 'Кошка-корова', 'Cat-cow'), 'MOBILITY', ['spine'], 'Mat'],
    [lt('90/90 жамбас', 'Тазобедренные 90/90', '90/90 hip switch'), 'MOBILITY', ['hips'], 'Mat'],
    [lt('Ролик массажы', 'Массаж роллом', 'Foam rolling'), 'RECOVERY', ['full body'], 'Foam roller'],
    [lt('Өлі қоңыз', 'Мёртвый жук', 'Dead bug'), 'CORE', ['core'], 'Mat'],
  ];
  const exercises = [];
  for (const [name, category, muscles, equipment] of exerciseDefs) {
    exercises.push(
      await prisma.exercise.create({
        data: {
          name,
          category,
          muscleGroups: muscles,
          equipment,
          instructions: lt(
            'Техниканы бақылаңыз, демалысты сақтаңыз.',
            'Контролируйте технику, соблюдайте отдых.',
            'Control the tempo and keep strict form.',
          ),
          createdById: staffUsers['trainer@fitclub.test']!.id,
        },
      }),
    );
  }
  const E = (en: string) => exercises.find((e) => (e.name as LocalizedText).en === en)!.id;
  const arman = T('arman-seitkali');
  const program = await prisma.trainingProgram.create({
    data: {
      trainerId: arman.id,
      name: 'Foundation Strength · 8 weeks',
      description: 'Three full-body sessions a week focused on the main lifts.',
      goal: 'Build base strength',
      level: 'BEGINNER',
      durationWeeks: 8,
      days: {
        create: [
          {
            dayIndex: 0,
            title: 'Day A — Squat & press',
            weekday: 0,
            exercises: {
              create: [
                { exerciseId: E('Back squat'), order: 0, sets: 4, reps: 8, restSeconds: 120 },
                { exerciseId: E('Bench press'), order: 1, sets: 4, reps: 8, restSeconds: 120 },
                { exerciseId: E('Plank'), order: 2, sets: 3, durationSeconds: 45, restSeconds: 45 },
              ],
            },
          },
          {
            dayIndex: 1,
            title: 'Day B — Hinge & pull',
            weekday: 2,
            exercises: {
              create: [
                { exerciseId: E('Deadlift'), order: 0, sets: 3, reps: 5, restSeconds: 150 },
                { exerciseId: E('Pull-up'), order: 1, sets: 4, reps: 6, restSeconds: 90 },
                { exerciseId: E('Dead bug'), order: 2, sets: 3, reps: 12, restSeconds: 45 },
              ],
            },
          },
          {
            dayIndex: 2,
            title: 'Day C — Conditioning',
            weekday: 4,
            exercises: {
              create: [
                { exerciseId: E('Kettlebell swing'), order: 0, sets: 5, reps: 15, restSeconds: 60 },
                { exerciseId: E('Row erg'), order: 1, sets: 4, durationSeconds: 120, restSeconds: 60 },
                { exerciseId: E('Walking lunge'), order: 2, sets: 3, reps: 12, restSeconds: 60 },
              ],
            },
          },
        ],
      },
    },
    include: { days: { include: { exercises: true } } },
  });
  await prisma.trainingProgram.create({
    data: {
      trainerId: T('dana-akhmetova').id,
      name: 'Mobility Reset · template',
      description: 'Daily 20-minute mobility routine.',
      goal: 'Mobility',
      level: 'ALL_LEVELS',
      durationWeeks: 4,
      isTemplate: true,
      days: {
        create: [
          {
            dayIndex: 0,
            title: 'Daily flow',
            exercises: {
              create: [
                { exerciseId: E('Cat-cow'), order: 0, sets: 2, reps: 10, restSeconds: 15 },
                { exerciseId: E('90/90 hip switch'), order: 1, sets: 2, reps: 10, restSeconds: 15 },
                { exerciseId: E('Foam rolling'), order: 2, sets: 1, durationSeconds: 300, restSeconds: 0 },
              ],
            },
          },
        ],
      },
    },
  });
  const assignment = await prisma.programAssignment.create({
    data: {
      programId: program.id,
      memberId: demoMember.id,
      trainerId: arman.id,
      startDate: dbDate(addDaysToKey(TODAY, -14)),
      memberInstructions: 'Warm up 10 minutes before every session. Add 2.5 kg when all sets feel easy.',
      trainerNotes: 'Watch knee valgus on squats.',
    },
  });
  for (let w = 0; w < 5; w++) {
    const day = program.days[w % 3]!;
    const completedAt = daysAgo(13 - w * 3, 19 * 60);
    await prisma.workoutLog.create({
      data: {
        assignmentId: assignment.id,
        memberId: demoMember.id,
        programDayId: day.id,
        completedAt,
        durationMinutes: int(45, 70),
        perceivedEffort: int(6, 8),
        notes: w === 4 ? 'New best on squats!' : '',
        sets: {
          create: day.exercises.flatMap((ex) =>
            Array.from({ length: ex.sets }, (_, s) => ({
              exerciseId: ex.exerciseId,
              setIndex: s + 1,
              reps: ex.reps,
              durationSeconds: ex.durationSeconds,
              weightKg: ex.reps ? new Prisma.Decimal(30 + w * 2.5 + (ex.order === 0 ? 20 : 0)) : null,
            })),
          ),
        },
      },
    });
  }

  // ───────────── CMS ─────────────
  for (const [key, block] of Object.entries(BLOCKS)) {
    await prisma.contentEntry.create({
      data: {
        key,
        data: { fields: block.fields, images: block.images ?? {}, items: block.items ?? [] },
        updatedById: owner.id,
      },
    });
  }
  for (const [i, f] of FAQ.entries())
    await prisma.faqItem.create({ data: { question: f.q, answer: f.a, category: f.category, sortOrder: i * 10 } });
  for (const [i, t] of TESTIMONIALS.entries())
    await prisma.testimonial.create({
      data: { authorName: t.authorName, authorDetail: t.detail, quote: t.quote, rating: t.rating, sortOrder: i * 10 },
    });
  for (const [i, f] of FACILITIES.entries()) {
    await prisma.facility.create({
      data: {
        slug: f.slug,
        name: f.name,
        description: f.description,
        icon: f.icon,
        image: img(f.image, f.name),
        branchIds: f.slug === 'pool' ? [astana.id] : [],
        sortOrder: i * 10,
      },
    });
  }
  for (const [i, g] of GALLERY.entries())
    await prisma.galleryItem.create({
      data: { image: img(g.url, g.caption), caption: g.caption, category: g.category, sortOrder: i * 10 },
    });
  for (const p of BLOG) {
    await prisma.blogPost.create({
      data: {
        slug: p.slug,
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
        coverImage: img(p.cover, p.title),
        tags: p.tags,
        status: 'PUBLISHED',
        publishedAt: daysAgo(p.daysAgo),
        authorId: owner.id,
      },
    });
  }
  await prisma.announcement.create({
    data: {
      message: lt(
        'Демо-сайт: барлық деректер ойдан шығарылған. Нақты төлемдер қабылданбайды.',
        'Демо-сайт: все данные вымышлены. Реальные платежи не принимаются.',
        'Demo site: all data is fictional. No real payments are taken.',
      ),
      linkUrl: null,
      isActive: true,
    },
  });

  // ───────────── Notifications for the demo member ─────────────
  await prisma.notification.createMany({
    data: [
      {
        userId: demoMember.userId,
        type: 'MEMBERSHIP_ACTIVATED',
        data: {
          planName: plans.UNLIMITED!.name,
          endsOn: localDateKey(new Date(demoMember.membership!.endsAt.getTime() - 1)),
        },
        createdAt: daysAgo(10),
      },
      {
        userId: demoMember.userId,
        type: 'PROGRAM_ASSIGNED',
        data: { trainerName: arman.displayName, programName: program.name },
        createdAt: daysAgo(14),
      },
    ],
  });

  await prisma.auditLog.create({
    data: {
      actorId: owner.id,
      action: 'seed.demo_data',
      entityType: 'Club',
      entityId: club.id,
      metadata: { members: members.length },
    },
  });

  const counts = {
    branches: await prisma.branch.count(),
    members: await prisma.member.count(),
    memberships: await prisma.membership.count(),
    sessions: await prisma.classSession.count(),
    bookings: await prisma.booking.count(),
    checkIns: await prisma.checkIn.count(),
    payments: await prisma.payment.count(),
    leads: await prisma.lead.count(),
  };
  console.log('Seeded demo club:', counts);
  console.log('Demo accounts: owner@, admin@, manager@, reception@, sales@, trainer@, member@fitclub.test');
  if (generated) console.log(`Generated demo password (set SEED_DEMO_PASSWORD to choose your own): ${password}`);
  else console.log('Demo password: value of SEED_DEMO_PASSWORD in apps/api/.env');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
