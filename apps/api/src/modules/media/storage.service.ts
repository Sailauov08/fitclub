import { Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';

export interface StoredObject {
  key: string;
  url: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
}

/** Writes uploads to disk; main.ts serves them from /uploads. Needs a persistent, writable disk. */
class LocalStorageDriver implements StorageDriver {
  readonly root = resolve(process.cwd(), env.UPLOAD_DIR);

  async put(key: string, body: Buffer): Promise<StoredObject> {
    const path = join(this.root, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body);
    return { key, url: `/uploads/${key}` };
  }
}

/**
 * Keeps image bytes in PostgreSQL; main.ts serves them from /uploads with long-lived caching.
 * Used on serverless hosts (Vercel) where the filesystem is read-only and ephemeral.
 */
class DatabaseStorageDriver implements StorageDriver {
  constructor(private readonly prisma: PrismaService) {}

  async put(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
    await this.prisma.storedFile.create({
      data: { key, contentType, sizeBytes: body.length, bytes: new Uint8Array(body) },
    });
    return { key, url: `/uploads/${key}` };
  }
}

export const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** Detects the real file type from magic bytes — the client-supplied MIME type is not trusted. */
export function sniffImageType(buf: Buffer): keyof typeof ALLOWED_IMAGE_TYPES | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

@Injectable()
export class StorageService {
  private readonly driver: StorageDriver;

  constructor(private readonly prisma: PrismaService) {
    this.driver = env.STORAGE_DRIVER === 'database' ? new DatabaseStorageDriver(prisma) : new LocalStorageDriver();
  }

  /** Reads an uploaded file stored with the database driver. */
  readStored(key: string) {
    return this.prisma.storedFile.findUnique({ where: { key }, select: { bytes: true, contentType: true } });
  }

  get localRoot() {
    return resolve(process.cwd(), env.UPLOAD_DIR);
  }

  async putImage(folder: string, body: Buffer, mime: keyof typeof ALLOWED_IMAGE_TYPES): Promise<StoredObject> {
    const now = new Date();
    const key = `${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}.${ALLOWED_IMAGE_TYPES[mime]}`;
    return this.driver.put(key, body, mime);
  }
}
