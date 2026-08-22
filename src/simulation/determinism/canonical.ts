import type { JsonObject, JsonValue } from '../../shared/json';

function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (isJsonArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const objectValue: JsonObject = value;
  return `{${Object.keys(objectValue).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)).map((key) => `${JSON.stringify(key)}:${canonicalJson(objectValue[key]!)}`).join(',')}}`;
}
