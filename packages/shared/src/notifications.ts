import type { NotificationCategory } from './schemas/auth';
import type { Locale } from './i18n';

export const NOTIFICATION_TYPES = [
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'WAITLIST_JOINED',
  'WAITLIST_PROMOTED',
  'SESSION_CANCELLED',
  'CLASS_REMINDER',
  'MEMBERSHIP_ACTIVATED',
  'MEMBERSHIP_EXTENDED',
  'MEMBERSHIP_FROZEN',
  'MEMBERSHIP_UNFROZEN',
  'MEMBERSHIP_EXPIRING',
  'MEMBERSHIP_EXPIRED',
  'MEMBERSHIP_CANCELLED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'PAYMENT_REFUNDED',
  'PROGRAM_ASSIGNED',
  'LEAD_ASSIGNED',
  'ADMIN_ALERT',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Email-only transactional messages; always sent regardless of preferences. */
export const EMAIL_ONLY_TYPES = ['PASSWORD_RESET', 'EMAIL_VERIFY', 'STAFF_INVITE', 'MEMBER_INVITE'] as const;
export type EmailOnlyType = (typeof EMAIL_ONLY_TYPES)[number];

export const NOTIFICATION_CATEGORY: Record<NotificationType, NotificationCategory | 'system'> = {
  BOOKING_CONFIRMED: 'bookings',
  BOOKING_CANCELLED: 'bookings',
  WAITLIST_JOINED: 'bookings',
  WAITLIST_PROMOTED: 'bookings',
  SESSION_CANCELLED: 'bookings',
  CLASS_REMINDER: 'reminders',
  MEMBERSHIP_ACTIVATED: 'membership',
  MEMBERSHIP_EXTENDED: 'membership',
  MEMBERSHIP_FROZEN: 'membership',
  MEMBERSHIP_UNFROZEN: 'membership',
  MEMBERSHIP_EXPIRING: 'reminders',
  MEMBERSHIP_EXPIRED: 'membership',
  MEMBERSHIP_CANCELLED: 'membership',
  PAYMENT_SUCCEEDED: 'payments',
  PAYMENT_FAILED: 'payments',
  PAYMENT_REFUNDED: 'payments',
  PROGRAM_ASSIGNED: 'membership',
  LEAD_ASSIGNED: 'system',
  ADMIN_ALERT: 'system',
};

type Template = { title: string; body: string };
type Templates = Record<NotificationType | EmailOnlyType, Record<Locale, Template>>;

/** `{name}` placeholders are filled from the notification's data. */
export const NOTIFICATION_TEMPLATES: Templates = {
  BOOKING_CONFIRMED: {
    kk: { title: 'Жазылу расталды', body: '{className} — {when}. Сізді күтеміз!' },
    ru: { title: 'Запись подтверждена', body: '{className} — {when}. Ждём вас!' },
    en: { title: 'Booking confirmed', body: '{className} — {when}. See you there!' },
  },
  BOOKING_CANCELLED: {
    kk: { title: 'Жазылу болдырылмады', body: '{className} — {when} сабағына жазылу болдырылмады.' },
    ru: { title: 'Запись отменена', body: 'Запись на {className} — {when} отменена.' },
    en: { title: 'Booking cancelled', body: 'Your booking for {className} — {when} was cancelled.' },
  },
  WAITLIST_JOINED: {
    kk: { title: 'Күту тізіміне қосылдыңыз', body: '{className} — {when}. Тізімдегі орныңыз: {position}.' },
    ru: { title: 'Вы в листе ожидания', body: '{className} — {when}. Ваша позиция: {position}.' },
    en: { title: 'You joined the waitlist', body: '{className} — {when}. Your position: {position}.' },
  },
  WAITLIST_PROMOTED: {
    kk: { title: 'Орын босады!', body: 'Сіз {className} — {when} сабағына жазылдыңыз.' },
    ru: { title: 'Место освободилось!', body: 'Вы записаны на {className} — {when}.' },
    en: { title: 'A spot opened up!', body: 'You are now booked for {className} — {when}.' },
  },
  SESSION_CANCELLED: {
    kk: { title: 'Сабақ болдырылмады', body: '{className} — {when} сабағы болдырылмады. Себебі: {reason}' },
    ru: { title: 'Занятие отменено', body: 'Занятие {className} — {when} отменено. Причина: {reason}' },
    en: { title: 'Class cancelled', body: '{className} — {when} has been cancelled. Reason: {reason}' },
  },
  CLASS_REMINDER: {
    kk: { title: 'Сабақ жақында басталады', body: '{className} {when} басталады, {room}.' },
    ru: { title: 'Скоро занятие', body: '{className} начинается {when}, {room}.' },
    en: { title: 'Class coming up', body: '{className} starts {when}, {room}.' },
  },
  MEMBERSHIP_ACTIVATED: {
    kk: { title: 'Абонемент белсендірілді', body: '«{planName}» {endsOn} дейін жарамды.' },
    ru: { title: 'Абонемент активирован', body: '«{planName}» действует до {endsOn}.' },
    en: { title: 'Membership activated', body: '"{planName}" is valid until {endsOn}.' },
  },
  MEMBERSHIP_EXTENDED: {
    kk: { title: 'Абонемент ұзартылды', body: '«{planName}» енді {endsOn} дейін жарамды.' },
    ru: { title: 'Абонемент продлён', body: '«{planName}» теперь действует до {endsOn}.' },
    en: { title: 'Membership extended', body: '"{planName}" is now valid until {endsOn}.' },
  },
  MEMBERSHIP_FROZEN: {
    kk: { title: 'Абонемент тоқтатылды', body: '{startsOn} бастап {days} күнге. Жаңа аяқталу күні: {endsOn}.' },
    ru: { title: 'Абонемент заморожен', body: 'С {startsOn} на {days} дн. Новая дата окончания: {endsOn}.' },
    en: { title: 'Membership frozen', body: 'From {startsOn} for {days} days. New end date: {endsOn}.' },
  },
  MEMBERSHIP_UNFROZEN: {
    kk: { title: 'Абонемент қайта белсенді', body: '«{planName}» {endsOn} дейін жарамды.' },
    ru: { title: 'Абонемент снова активен', body: '«{planName}» действует до {endsOn}.' },
    en: { title: 'Membership active again', body: '"{planName}" is valid until {endsOn}.' },
  },
  MEMBERSHIP_EXPIRING: {
    kk: {
      title: 'Абонемент мерзімі аяқталуда',
      body: '«{planName}» {endsOn} аяқталады. Жаттығуды үзбеу үшін ұзартыңыз.',
    },
    ru: {
      title: 'Абонемент скоро закончится',
      body: '«{planName}» заканчивается {endsOn}. Продлите, чтобы не прерывать тренировки.',
    },
    en: {
      title: 'Membership ending soon',
      body: '"{planName}" ends on {endsOn}. Renew to keep training without a break.',
    },
  },
  MEMBERSHIP_EXPIRED: {
    kk: { title: 'Абонемент мерзімі аяқталды', body: '«{planName}» мерзімі аяқталды. Сізді қайта күтеміз!' },
    ru: { title: 'Абонемент закончился', body: 'Срок действия «{planName}» истёк. Будем рады видеть вас снова!' },
    en: { title: 'Membership expired', body: '"{planName}" has expired. We would love to see you back!' },
  },
  MEMBERSHIP_CANCELLED: {
    kk: { title: 'Абонемент жойылды', body: '«{planName}» жойылды.' },
    ru: { title: 'Абонемент аннулирован', body: '«{planName}» аннулирован.' },
    en: { title: 'Membership cancelled', body: '"{planName}" has been cancelled.' },
  },
  PAYMENT_SUCCEEDED: {
    kk: { title: 'Төлем қабылданды', body: '{amount} — шот {invoiceNumber}.' },
    ru: { title: 'Оплата получена', body: '{amount} — счёт {invoiceNumber}.' },
    en: { title: 'Payment received', body: '{amount} — invoice {invoiceNumber}.' },
  },
  PAYMENT_FAILED: {
    kk: { title: 'Төлем өтпеді', body: '{amount} төлемі өтпеді. Қайталап көріңіз немесе ресепшенге хабарласыңыз.' },
    ru: {
      title: 'Оплата не прошла',
      body: 'Платёж на {amount} не прошёл. Попробуйте ещё раз или обратитесь на ресепшен.',
    },
    en: {
      title: 'Payment failed',
      body: 'The payment of {amount} did not go through. Please try again or contact reception.',
    },
  },
  PAYMENT_REFUNDED: {
    kk: { title: 'Қаражат қайтарылды', body: '{amount} қайтарылды.' },
    ru: { title: 'Возврат оформлен', body: 'Оформлен возврат {amount}.' },
    en: { title: 'Refund issued', body: 'A refund of {amount} has been issued.' },
  },
  PROGRAM_ASSIGNED: {
    kk: {
      title: 'Жаңа жаттығу бағдарламасы',
      body: 'Жаттықтырушы {trainerName} сізге «{programName}» бағдарламасын тағайындады.',
    },
    ru: { title: 'Новая программа тренировок', body: 'Тренер {trainerName} назначил вам программу «{programName}».' },
    en: { title: 'New training programme', body: '{trainerName} assigned you "{programName}".' },
  },
  LEAD_ASSIGNED: {
    kk: { title: 'Жаңа лид', body: '{leadName} сізге тағайындалды.' },
    ru: { title: 'Новый лид', body: 'Вам назначен лид: {leadName}.' },
    en: { title: 'New lead', body: '{leadName} was assigned to you.' },
  },
  ADMIN_ALERT: {
    kk: { title: '{title}', body: '{body}' },
    ru: { title: '{title}', body: '{body}' },
    en: { title: '{title}', body: '{body}' },
  },
  PASSWORD_RESET: {
    kk: {
      title: 'Құпиясөзді қалпына келтіру',
      body: 'Жаңа құпиясөз орнату үшін сілтемені ашыңыз (1 сағат жарамды): {link}',
    },
    ru: {
      title: 'Восстановление пароля',
      body: 'Чтобы задать новый пароль, откройте ссылку (действует 1 час): {link}',
    },
    en: { title: 'Reset your password', body: 'Open this link to set a new password (valid for 1 hour): {link}' },
  },
  EMAIL_VERIFY: {
    kk: { title: 'Email растаңыз', body: 'Email мекенжайыңызды растау үшін сілтемені ашыңыз: {link}' },
    ru: { title: 'Подтвердите email', body: 'Откройте ссылку, чтобы подтвердить адрес: {link}' },
    en: { title: 'Confirm your email', body: 'Open this link to confirm your address: {link}' },
  },
  STAFF_INVITE: {
    kk: {
      title: 'FITCLUB командасына шақыру',
      body: 'Сізді {role} рөліне шақырды. Тіркелгіні белсендіру (72 сағат): {link}',
    },
    ru: {
      title: 'Приглашение в команду FITCLUB',
      body: 'Вас пригласили на роль {role}. Активируйте аккаунт (72 часа): {link}',
    },
    en: {
      title: 'Join the FITCLUB team',
      body: 'You have been invited as {role}. Activate your account (72 hours): {link}',
    },
  },
  MEMBER_INVITE: {
    kk: { title: 'FITCLUB-қа қош келдіңіз', body: 'Жеке кабинетке кіру үшін құпиясөз орнатыңыз: {link}' },
    ru: { title: 'Добро пожаловать в FITCLUB', body: 'Задайте пароль для входа в личный кабинет: {link}' },
    en: { title: 'Welcome to FITCLUB', body: 'Set a password to access your member portal: {link}' },
  },
};

export function renderTemplate(
  type: NotificationType | EmailOnlyType,
  locale: Locale,
  data: Record<string, string | number | null | undefined>,
): Template {
  const template = NOTIFICATION_TEMPLATES[type][locale];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, key: string) => String(data[key] ?? ''));
  return { title: fill(template.title), body: fill(template.body) };
}
