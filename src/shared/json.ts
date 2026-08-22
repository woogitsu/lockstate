export type JsonPrimitive = string | number | boolean | null;

export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export const MAX_JSON_VALUE_DEPTH = 64;

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validateJsonValue(
  value: unknown,
  depth: number,
  maxDepth: number,
  ancestors: WeakSet<object>,
): value is JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value !== 'object' || depth > maxDepth) {
    return false;
  }

  if (ancestors.has(value)) {
    return false;
  }

  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const ownKeys = Reflect.ownKeys(value);
      if (ownKeys.length !== value.length + 1) {
        return false;
      }

      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !('value' in descriptor)) {
          return false;
        }

        if (
          !validateJsonValue(
            descriptor.value,
            depth + 1,
            maxDepth,
            ancestors,
          )
        ) {
          return false;
        }
      }

      return true;
    }

    if (!isPlainObject(value) || Object.getOwnPropertySymbols(value).length > 0) {
      return false;
    }

    for (const key of Object.keys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        return false;
      }

      if (!validateJsonValue(descriptor.value, depth + 1, maxDepth, ancestors)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  } finally {
    ancestors.delete(value);
  }
}

export function isJsonValue(
  value: unknown,
  maxDepth = MAX_JSON_VALUE_DEPTH,
): value is JsonValue {
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    return false;
  }

  return validateJsonValue(value, 0, maxDepth, new WeakSet<object>());
}
