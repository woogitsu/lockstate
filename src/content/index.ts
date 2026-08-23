export * from './contraband-catalog';
export * from './default-locale-en';
export * from './item-catalog';
export * from './localization';
export * from './object-catalog';
export * from './registry';
export * from './room-catalog';
export * from './security-grade-catalog';
export * from './simulation-message-keys';
export * from './staff-role-catalog';
export * from './validate-catalog';

import { defaultObjectRegistry } from './object-catalog';
import { defaultRoomContentRegistry } from './room-catalog';
import { validateRoomObjectReferences } from './validate-catalog';

/**
 * Cross-catalog validation the individual catalog modules can't do on
 * their own (each only validates itself). Runs once at import time for the
 * default catalogs, exactly like each catalog module's own
 * schema/duplicate check -- a dangling room-to-object reference fails
 * fast at startup, not silently at first use.
 */
const defaultCrossReferenceErrors = validateRoomObjectReferences(defaultRoomContentRegistry, defaultObjectRegistry);

if (defaultCrossReferenceErrors.length > 0) {
  throw new Error(`Default content catalogs failed cross-reference validation: ${JSON.stringify(defaultCrossReferenceErrors)}`);
}
