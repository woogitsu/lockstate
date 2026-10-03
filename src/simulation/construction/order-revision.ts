/** Exact order-state tokens, owner-approved V10 / Issue #2025. JSON stores strings. */
export type OrderRevision = string;

export function isOrderRevision(value: unknown): value is OrderRevision {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value);
}

/** No Number conversion, saturation or wrap; each transition produces a distinct token. */
export function incrementOrderRevision(value: OrderRevision): OrderRevision {
  return (BigInt(value) + 1n).toString(10);
}
