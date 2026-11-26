import "fast-text-encoding";
import { fromByteArray } from "base64-js";
import { CryptoDigestAlgorithm, digest, getRandomValues } from "expo-crypto";

/**
 * Supabase uses WebCrypto for the PKCE verifier and S256 challenge. Bridge only
 * the operations its native Hermes runtime needs. Missing methods fail closed.
 */
export function ensurePkceCrypto() {
  if (typeof globalThis.btoa !== "function") {
    Object.defineProperty(globalThis, "btoa", {
      value: (value: string) => fromByteArray(Uint8Array.from(value, (character) => {
        const byte = character.charCodeAt(0);
        if (character.length !== 1 || byte > 255) throw new TypeError("Expected a binary string");
        return byte;
      })),
    });
  }
  if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: {} });
  if (!globalThis.crypto.getRandomValues) {
    Object.defineProperty(globalThis.crypto, "getRandomValues", { value: getRandomValues });
  }
  if (!globalThis.crypto.subtle) {
    Object.defineProperty(globalThis.crypto, "subtle", {
      value: {
        digest(algorithm: string, data: Parameters<typeof digest>[1]) {
          if (algorithm !== "SHA-256") throw new Error("Unsupported digest");
          return digest(CryptoDigestAlgorithm.SHA256, data);
        },
      },
    });
  }

}
