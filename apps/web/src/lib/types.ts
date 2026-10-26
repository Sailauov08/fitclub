import type {
  LocalizedText,
  Permission,
  Role,
  MembershipStatus,
  BookingStatus,
  PaymentStatus,
  PaymentMethod,
  NotificationPrefs,
  ImageRef,
} from '@fitclub/shared';

export interface Me {
  id: string;
  email: string;
  locale: 'kk' | 'ru' | 'en';
  emailVerified: boolean;
  role: Role;
  permissions: Permission[];
  profile: {
    firstName: string;
    lastName: string;
    phone: string | null;
    avatarUrl: string | null;
    birthDate: string | null;
  } | null;
  notificationPrefs: NotificationPrefs;
  member: { id: string; memberNumber: number; homeBranch: { id: string; name: LocalizedText; slug: string } } | null;
  staff: {
    role: Role;
    title: string | null;
    branch: { id: string; name: LocalizedText } | null;
    trainerId: string | null;
  } | null;
  isDemo: boolean;
}

export interface Plan {
  id: string;
  code: string;
  type: string;
  name: LocalizedText;
  description: LocalizedText;
  features: LocalizedText[];
  price: number;
  durationDays: number;
  visitLimit: number | null;
  includesClasses: boolean;
  allBranches: boolean;
  branchIds: string[];
  freezeMaxDays: number;
  freezeMaxTimes: number;
  requiresStudentId: boolean;
  isPublic: boolean;
  isFeatured: boolean;
  sortOrder: number;
  status: 'ACTIVE' | 'ARCHIVED';
  version: number;
  totalSold?: number;
  activeCount?: number;
}

export interface Branch {
  id: string;
  slug: string;
  name: LocalizedText;
  city: LocalizedText;
  address: LocalizedText;
  description?: LocalizedText;
  phone: string;
  email?: string;
  latitude: number | null;
  longitude: number | null;
  openingHours: { open: string; close: string; closed: boolean }[];
  imageUrl?: string | null;
}

export interface SessionItem {
  id: string;
  startsAt: string;
  endsAt: string;
  status: 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';
  capacity: number;
  bookedCount: number;
  spotsLeft: number;
  cancelReason: string | null;
  classType: {
    id: string;
    slug: string;
    name: LocalizedText;
    summary: LocalizedText;
    difficulty: string;
    intensity: number;
    imageUrl: string | null;
    category: { id: string; slug: string; name: LocalizedText };
  };
  trainer: { id: string; slug: string; displayName: string; photoUrl: string | null };
  room: { id: string; name: LocalizedText };
  branch: { id: string; slug: string; name: LocalizedText };
  myBooking: { id: string; status: BookingStatus } | null;
  myWaitlist: { id: string } | null;
}

export interface MembershipRow {
  id: string;
  status: MembershipStatus;
  startsAt: string;
  endsAt: string;
  price: number;
  visitLimit: number | null;
  visitsUsed: number;
  includesClasses: boolean;
  allBranches: boolean;
  freezeMaxDays: number;
  freezeMaxTimes: number;
  frozenDaysUsed: number;
  freezeCount: number;
  planId: string;
  planSnapshot: { name: LocalizedText; code: string; durationDays: number };
  freezes: { id: string; startDate: string; endDate: string; days: number; status: string; reason: string | null }[];
  events: { id: string; type: string; createdAt: string; data: Record<string, unknown> | null }[];
  payments: {
    id: string;
    amount: number;
    status: PaymentStatus;
    method: PaymentMethod;
    paidAt: string | null;
    isTest: boolean;
    purpose: string;
    createdAt: string;
  }[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type { ImageRef };
