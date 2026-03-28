/**
 * Generic VDXF encoding/decoding utilities.
 *
 * These functions work with any VDXF contentmultimap data — not specific
 * to any platform or application. The DataDescriptor nesting pattern is
 * the standard Verus way to store structured data on-chain.
 */

/** Global DataDescriptor key (same across all Verus identities) */
export const DATA_DESCRIPTOR_KEY = 'i4GC1YGEVD21afWudGoFJVdnfjJ5XWnCQv';

/**
 * Build a sub-DataDescriptor (text/plain, flags=96).
 * Label is the field i-address, value is stored as objectdata.message.
 */
export function makeSubDD(label: string, value: string): object {
  return {
    [DATA_DESCRIPTOR_KEY]: {
      version: 1,
      flags: 96,
      mimetype: 'text/plain',
      objectdata: { message: value },
      label,
    },
  };
}

/**
 * Build an outer DataDescriptor that wraps an array of sub-DDs.
 * flags=32 (raw), objectdata is the sub-DD array.
 */
export function makeOuterDD(subDDs: object[], label?: string): object {
  return {
    [DATA_DESCRIPTOR_KEY]: {
      version: 1,
      flags: 32,
      objectdata: subDDs,
      ...(label ? { label } : {}),
    },
  };
}

/**
 * Parse a sub-DD to extract label + value.
 */
export function parseSubDD(entry: unknown): { label: string; value: unknown } | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const dd = (entry as Record<string, unknown>)[DATA_DESCRIPTOR_KEY] as Record<string, unknown> | undefined;
  if (!dd) return null;
  const label = (dd.label as string) || '';
  if (dd.objectdata === null) return null;
  if (typeof dd.objectdata === 'object' && dd.objectdata !== null && 'message' in (dd.objectdata as object)) {
    return { label, value: (dd.objectdata as { message: unknown }).message };
  }
  if (typeof dd.objectdata === 'string') {
    try { return { label, value: JSON.parse(Buffer.from(dd.objectdata, 'hex').toString('utf-8')) }; }
    catch { return { label, value: dd.objectdata }; }
  }
  return { label, value: dd.objectdata };
}

/**
 * Parse an outer DD (nested pattern — objectdata is an array of sub-DDs).
 * Uses an optional reverseLookup map to resolve i-address labels to human-readable field names.
 */
export function parseOuterDD(entry: unknown, reverseLookup?: Record<string, string>): Record<string, unknown> | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const dd = (entry as Record<string, unknown>)[DATA_DESCRIPTOR_KEY] as Record<string, unknown> | undefined;
  if (!dd) return null;
  if (!Array.isArray(dd.objectdata)) return null;

  const record: Record<string, unknown> = {};
  for (const subEntry of dd.objectdata) {
    const sub = parseSubDD(subEntry);
    if (!sub || !sub.label) continue;
    const fieldName = reverseLookup?.[sub.label] || sub.label;
    record[fieldName] = sub.value;
  }
  return record;
}

/** Encode a value as VDXF hex (JSON → UTF-8 → hex). */
export function encodeVdxfValue(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('hex');
}

/** Decode a VDXF hex value back to its original form (hex → UTF-8 → JSON). */
export function decodeVdxfValue(hex: string): unknown {
  try {
    return JSON.parse(Buffer.from(hex, 'hex').toString('utf8'));
  } catch {
    return Buffer.from(hex, 'hex').toString('utf8');
  }
}

/**
 * Merge two contentmultimaps. Values from `additions` are appended to `existing`.
 */
export function mergeContentMultimap(
  existing: Record<string, unknown[]>,
  additions: Record<string, unknown[]>,
): Record<string, unknown[]> {
  const merged: Record<string, unknown[]> = {};

  for (const [key, values] of Object.entries(existing)) {
    merged[key] = Array.isArray(values) ? [...values] : [values];
  }

  for (const [key, values] of Object.entries(additions)) {
    if (merged[key]) {
      merged[key] = [...merged[key], ...values];
    } else {
      merged[key] = [...values];
    }
  }

  return merged;
}

/**
 * Build an updateidentity RPC payload from an identity name and contentmultimap.
 */
export function buildUpdateIdentityPayload(
  identityName: string,
  contentmultimap: Record<string, unknown[]>,
  defaultParent?: string,
): Record<string, unknown> {
  const clean = identityName.replace(/@$/, '');
  const parts = clean.split('.');
  const name = parts[0] || clean;
  const parent = parts.length > 1 ? parts.slice(1).join('.') : (defaultParent || parts[0]);

  return { name, parent, contentmultimap };
}

/**
 * Build a verus CLI updateidentity command array.
 */
export function buildUpdateIdentityCommand(
  payload: Record<string, unknown>,
  chain: 'verustest' | 'verus' = 'verustest',
): string[] {
  const args = ['verus'];
  if (chain === 'verustest') args.push('-chain=vrsctest');
  args.push('updateidentity', JSON.stringify(payload));
  return args;
}
