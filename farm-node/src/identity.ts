/**
 * Node Identity Manager
 *
 * Generates and persists the farm node's keypair and address.
 * On a real node, this would use the ATECC608B secure element.
 * For the prototype, we use a file-based key stored on the Pi's SD card.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from './config';

interface NodeIdentity {
  address: string;
  privateKey: string;
  publicKey: string;
  farmId: string;
  createdAt: string;
}

const IDENTITY_FILE = path.join(CONFIG.dataDir, 'identity.json');

/**
 * Load existing identity or generate a new one
 */
export function loadOrCreateIdentity(): NodeIdentity {
  // Ensure data dir exists
  if (!fs.existsSync(CONFIG.dataDir)) {
    fs.mkdirSync(CONFIG.dataDir, { recursive: true });
  }

  // Try loading existing identity
  if (fs.existsSync(IDENTITY_FILE)) {
    const data = JSON.parse(fs.readFileSync(IDENTITY_FILE, 'utf-8'));
    console.log(`[identity] Loaded existing identity: ${data.address}`);
    return data;
  }

  // Generate new identity
  const keyPair = crypto.generateKeyPairSync('ec', {
    namedCurve: 'secp256k1',
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Derive address from public key hash
  const pubHash = crypto.createHash('sha256').update(keyPair.publicKey).digest('hex');
  const address = `woolly_${pubHash.slice(0, 40)}`;

  const identity: NodeIdentity = {
    address,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    farmId: CONFIG.farmId,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(IDENTITY_FILE, JSON.stringify(identity, null, 2));
  console.log(`[identity] Generated new identity: ${address}`);
  console.log(`[identity] Saved to ${IDENTITY_FILE}`);

  return identity;
}

/**
 * Sign data with the node's private key
 */
export function signTelemetry(data: string, privateKeyPem: string): string {
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  return sign.sign(privateKeyPem, 'hex');
}

/**
 * Verify a signature (for testing / cross-validation)
 */
export function verifySignature(data: string, signature: string, publicKeyPem: string): boolean {
  const verify = crypto.createVerify('SHA256');
  verify.update(data);
  verify.end();
  return verify.verify(publicKeyPem, signature, 'hex');
}
