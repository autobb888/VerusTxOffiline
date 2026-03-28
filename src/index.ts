/**
 * verus-tx-offline — Offline Verus transaction building and signing.
 *
 * Build and sign VRSC payments, P2ID (identity) transactions, identity updates,
 * VDXF encoding, and message signing — no daemon required.
 */

// Transaction building
export {
  buildPayment,
  selectUtxos,
  buildP2IDScript,
  isIAddress,
  wifToAddress,
  wifToPubkey,
  type Utxo,
  type PaymentParams,
} from './tx/payment.js';

// Identity — keypair generation & management
export {
  generateKeypair,
  keypairFromWIF,
  type Keypair,
} from './identity/keypair.js';

// Message signing
export {
  signMessage,
  signChallenge,
} from './identity/signer.js';

// Identity update (offline tx building)
export {
  buildIdentityUpdateTx,
  type IdentityUpdateParams,
  type RawIdentityData,
} from './identity/update.js';

// VDXF encoding/decoding
export {
  DATA_DESCRIPTOR_KEY,
  makeSubDD,
  makeOuterDD,
  parseSubDD,
  parseOuterDD,
  encodeVdxfValue,
  decodeVdxfValue,
  mergeContentMultimap,
  buildUpdateIdentityPayload,
  buildUpdateIdentityCommand,
} from './vdxf/encoding.js';

// Signed attestations
export {
  generateAttestationPayload,
  signAttestation,
  verifyAttestationFormat,
  type DeletionAttestation,
  type AttestationParams,
} from './privacy/attestation.js';
