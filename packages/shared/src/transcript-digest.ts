import { sha256 } from "@noble/hashes/sha256";
import { utf8ToBytes, bytesToHex } from "@noble/hashes/utils";

/** Initial digest: SHA-256("prompt-brawl-v1" ‖ trial_id) */
export function initDigest(trialId: string): string {
  return bytesToHex(sha256(utf8ToBytes("prompt-brawl-v1" + trialId)));
}

/** Append: SHA-256(prev_digest ‖ event_id ‖ sender_pubkey ‖ ciphertext) */
export function appendDigest(
  prevDigest: string,
  eventId: string,
  senderPubkey: string,
  ciphertext: string,
): string {
  return bytesToHex(sha256(utf8ToBytes(prevDigest + eventId + senderPubkey + ciphertext)));
}
