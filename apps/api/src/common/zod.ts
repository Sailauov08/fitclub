import { Body, PipeTransform, Query } from '@nestjs/common';
import { ApiBody } from '@nestjs/swagger';
import { z, type ZodType } from 'zod';

/** Validates and strips unknown keys (z.object strips by default), which blocks mass assignment. */
export class ZodPipe<T extends ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    return this.schema.parse(value ?? {});
  }
}

function jsonSchema(schema: ZodType): Record<string, unknown> {
  try {
    return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>;
  } catch {
    return { type: 'object' };
  }
}

/** `@ZBody(schema) body: T` — validated body, also documented as the OpenAPI request body. */
export function ZBody<T extends ZodType>(schema: T): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodPipe(schema))(target, key, index);
    if (key === undefined) return;
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) ApiBody({ schema: jsonSchema(schema) as never })(target, key, descriptor);
  };
}

export function ZQuery<T extends ZodType>(schema: T): ParameterDecorator {
  return Query(new ZodPipe(schema));
}
