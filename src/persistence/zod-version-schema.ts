import type { ZodType } from 'zod';
import type { VersionSchema } from './migration';

/** Adapts a strict Zod schema into the `VersionSchema` contract the migration chain consumes. */
export function zodVersionSchema<T>(version: number, schema: ZodType<T>): VersionSchema<T> {
  return {
    version,
    parse: (input) => {
      const result = schema.safeParse(input);
      if (result.success) return { ok: true, value: result.data };
      return {
        ok: false,
        issues: result.error.issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`),
      };
    },
  };
}
