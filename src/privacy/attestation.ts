/**
 * Signed attestation utilities.
 *
 * Provides a generic pattern for creating and signing canonical JSON attestations
 * using Verus message signing. Useful for deletion proofs, data integrity proofs,
 * or any scenario requiring a signed, deterministic JSON payload.
 */

import { signMessage } from '../identity/signer.js';
import { canonicalize as jsonCanonicalize } from 'json-canonicalize';

export interface DeletionAttestation {
  jobId: string;
  containerId: string;
  createdAt: string;
  destroyedAt: string;
  dataVolumes: string[];
  deletionMethod: string;
  attestedBy: string;
  signature: string;
}

export interface AttestationParams {
  jobId: string;
  containerId: string;
  createdAt: string;
  destroyedAt: string;
  dataVolumes?: string[];
  deletionMethod?: string;
  attestedBy: string;
}

/**
 * Generate the canonical JSON payload for a deletion attestation.
 */
export function generateAttestationPayload(params: AttestationParams): Omit<DeletionAttestation, 'signature'> {
  return {
    attestedBy: params.attestedBy,
    containerId: params.containerId,
    createdAt: params.createdAt,
    dataVolumes: params.dataVolumes ?? [],
    deletionMethod: params.deletionMethod ?? 'container-destroy+volume-rm',
    destroyedAt: params.destroyedAt,
    jobId: params.jobId,
  };
}

/**
 * Sign an attestation payload using Verus message signing.
 *
 * @param payload - The attestation payload (without signature)
 * @param wif - WIF private key for signing
 * @param network - 'verus' or 'verustest'
 * @returns Full attestation with signature
 */
export function signAttestation(
  payload: Omit<DeletionAttestation, 'signature'>,
  wif: string,
  network: 'verus' | 'verustest' = 'verustest',
): DeletionAttestation {
  const message = jsonCanonicalize(payload);
  const signature = signMessage(wif, message, network);
  return { ...payload, signature };
}

/**
 * Verify that a DeletionAttestation has all required fields with correct types.
 * Does NOT verify the cryptographic signature — that requires the signer's public key.
 */
export function verifyAttestationFormat(attestation: unknown): attestation is DeletionAttestation {
  if (!attestation || typeof attestation !== 'object') {
    throw new Error('Attestation must be a non-null object');
  }

  const a = attestation as Record<string, unknown>;
  const requiredStrings: Array<keyof DeletionAttestation> = [
    'jobId', 'containerId', 'createdAt', 'destroyedAt',
    'deletionMethod', 'attestedBy', 'signature',
  ];

  for (const field of requiredStrings) {
    if (typeof a[field] !== 'string' || (a[field] as string).length === 0) {
      throw new Error(`Missing or invalid field: ${field} (expected non-empty string)`);
    }
  }

  if (!Array.isArray(a.dataVolumes)) {
    throw new Error('Missing or invalid field: dataVolumes (expected string array)');
  }

  for (let i = 0; i < a.dataVolumes.length; i++) {
    if (typeof a.dataVolumes[i] !== 'string') {
      throw new Error(`dataVolumes[${i}] must be a string`);
    }
  }

  return true;
}
