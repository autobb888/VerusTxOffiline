/**
 * Identity update transaction builder.
 * Builds and signs `updateidentity` transactions offline using @bitgo/utxo-lib.
 * No Verus daemon required — uses external APIs for chain data.
 */

// @ts-ignore - VerusCoin fork, no TS declarations
import * as utxolib from '@bitgo/utxo-lib';
// @ts-ignore - VerusCoin fork dependency
import { Identity, IdentityScript } from 'verus-typescript-primitives';

import type { Utxo } from '../tx/payment.js';

const DEFAULT_FEE = 10000; // 0.0001 VRSC in satoshis
const SATS_PER_COIN = 100000000;

/** Raw identity data from chain (getidentity RPC or platform API) */
export interface RawIdentityData {
  identity: {
    version?: number;
    flags?: number;
    minimumsignatures: number;
    primaryaddresses: string[];
    parent: string;
    name: string;
    contentmap?: Record<string, string>;
    contentmultimap?: Record<string, unknown>;
    revocationauthority: string;
    recoveryauthority: string;
    systemid?: string;
    [key: string]: unknown;
  };
  /** Previous identity UTXO (needed to spend/update the identity) */
  prevOutput: {
    txid: string;
    vout: number;
    scriptHex: string;
    value: number;
  };
  /** Current block height (for expiry calculation) */
  blockHeight: number;
}

export interface IdentityUpdateParams {
  /** WIF private key */
  wif: string;
  /** Raw identity data from chain */
  identityData: RawIdentityData;
  /** UTXOs for funding the transaction fee */
  utxos: Utxo[];
  /** VDXF key-value pairs to ADD to contentmultimap */
  vdxfAdditions: Record<string, unknown[]>;
  /** Network (default: verustest) */
  network?: 'verus' | 'verustest';
  /** Fee in satoshis (default: 10000 = 0.0001 VRSC) */
  fee?: number;
  /** New revocation authority i-address (if changing) */
  revocationauthority?: string;
  /** New recovery authority i-address (if changing) */
  recoveryauthority?: string;
}

/**
 * Select UTXOs to cover the target amount (simple greedy algorithm).
 */
function selectUtxos(utxos: Utxo[], targetSatoshis: number): { selected: Utxo[]; total: number } {
  const sorted = [...utxos].sort((a, b) => b.satoshis - a.satoshis);
  const selected: Utxo[] = [];
  let total = 0;

  for (const utxo of sorted) {
    selected.push(utxo);
    total += utxo.satoshis;
    if (total >= targetSatoshis) break;
  }

  if (total < targetSatoshis) {
    throw new Error(`Insufficient funds: need ${targetSatoshis} satoshis, have ${total}`);
  }

  return { selected, total };
}

/**
 * Build a signed updateidentity transaction that adds VDXF data to contentmultimap.
 *
 * @returns Signed raw transaction hex ready for broadcast
 */
export function buildIdentityUpdateTx(params: IdentityUpdateParams): string {
  const {
    wif,
    identityData,
    utxos,
    vdxfAdditions,
    network = 'verustest',
    fee = DEFAULT_FEE,
    revocationauthority,
    recoveryauthority,
  } = params;

  const networkObj = network === 'verustest'
    ? utxolib.networks.verustest
    : utxolib.networks.verus;

  if (!identityData.prevOutput) {
    throw new Error('Identity prevOutput is required (previous identity transaction output)');
  }
  if (!identityData.identity) {
    throw new Error('Identity data is required');
  }
  if (utxos.length === 0) {
    throw new Error('At least one UTXO is required to fund the transaction fee');
  }

  // 1. Merge VDXF additions into current identity's contentmultimap
  const currentCmm: Record<string, unknown[]> = {};

  if (identityData.identity.contentmultimap) {
    for (const [key, values] of Object.entries(identityData.identity.contentmultimap)) {
      currentCmm[key] = Array.isArray(values) ? [...values] : [values];
    }
  }

  for (const [key, values] of Object.entries(vdxfAdditions)) {
    currentCmm[key] = [...values];
  }

  // 2. Build updated identity JSON (matching getidentity RPC output format)
  const idJson: Record<string, unknown> = {
    version: identityData.identity.version ?? 3,
    flags: identityData.identity.flags ?? 0,
    minimumsignatures: identityData.identity.minimumsignatures,
    primaryaddresses: identityData.identity.primaryaddresses,
    parent: identityData.identity.parent,
    name: identityData.identity.name,
    contentmap: identityData.identity.contentmap || {},
    contentmultimap: currentCmm,
    revocationauthority: revocationauthority || identityData.identity.revocationauthority,
    recoveryauthority: recoveryauthority || identityData.identity.recoveryauthority,
    systemid: identityData.identity.systemid || identityData.identity.parent,
    timelock: 0,
  };

  // 3. Create Identity object and get output script
  const identity = Identity.fromJson(idJson);
  const idOutputScript = IdentityScript.fromIdentity(identity).toBuffer();

  // 4. Create key pair from WIF
  const keyPair = utxolib.ECPair.fromWIF(wif, networkObj);
  const signerAddress = keyPair.getAddress();
  const signerScript = utxolib.address.toOutputScript(signerAddress, networkObj);

  // 5. Select R-address UTXOs to cover fee
  const rAddressUtxos = utxos.filter(u => u.satoshis > 0 && (!u.address || u.address === signerAddress));
  if (rAddressUtxos.length === 0) {
    throw new Error(`No spendable R-address UTXOs for fee. Fund ${signerAddress} with at least 0.0001 VRSC.`);
  }
  const { selected: selectedUtxos, total: totalInput } = selectUtxos(rAddressUtxos, fee);

  // 6. Build the transaction
  const txb = new utxolib.TransactionBuilder(networkObj);
  txb.setVersion(4);
  txb.setExpiryHeight(identityData.blockHeight + 200);
  txb.setVersionGroupId(0x892f2085);

  // Output 0: Updated identity (value=0)
  txb.addOutput(idOutputScript, 0);

  // Inputs: UTXOs for fee funding
  for (const utxo of selectedUtxos) {
    const txidBuf = Buffer.from(utxo.txid, 'hex').reverse();
    txb.addInput(txidBuf, utxo.vout, 0xffffffff, signerScript);
  }

  // Output 1: Change
  const change = totalInput - fee;
  if (change > 0) {
    txb.addOutput(signerScript, change);
  }

  // Input: Previous identity UTXO
  const prevIdTxid = Buffer.from(identityData.prevOutput.txid, 'hex').reverse();
  const prevIdScript = Buffer.from(identityData.prevOutput.scriptHex, 'hex');
  txb.addInput(prevIdTxid, identityData.prevOutput.vout, 0xffffffff, prevIdScript);

  // 7. Sign all inputs
  const SIGHASH_ALL = utxolib.Transaction.SIGHASH_ALL;

  for (let i = 0; i < selectedUtxos.length; i++) {
    txb.sign(i, keyPair, undefined, SIGHASH_ALL, selectedUtxos[i].satoshis);
  }

  const identityIdx = selectedUtxos.length;
  txb.sign(identityIdx, keyPair, undefined, SIGHASH_ALL, Math.round(identityData.prevOutput.value * SATS_PER_COIN));

  const signedTx = txb.build();
  return signedTx.toHex();
}
