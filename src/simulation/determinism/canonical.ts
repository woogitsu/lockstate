import type { JsonValue } from '../../shared/json';

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort((left, right) => (left < right ? -1 : left > right ? 1 : 0)).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`).join(',')}}`;
}
