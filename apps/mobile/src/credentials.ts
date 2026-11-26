import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const partSize = 1400;
const maxParts = 64;

interface Manifest {
  prefix: string;
  count: number;
}

function readManifest(value: string | null): Manifest | null {
  if (!value) return null;
  const { prefix, count } = JSON.parse(value) as Manifest;
  if (!/^[a-f0-9-]{36}$/.test(prefix) || !Number.isInteger(count) || count < 1 || count > maxParts) {
    throw new Error("Session storage is unreadable");
  }
  return { prefix, count };
}

const partKey = (key: string, record: Manifest, index: number) => `${key}.${record.prefix}.${index}`;
const read = (key: string) => SecureStore.getItemAsync(key, options);
const write = (key: string, value: string) => SecureStore.setItemAsync(key, value, options);
const remove = (key: string) => SecureStore.deleteItemAsync(key, options);

async function cleanup(key: string, record: Manifest | null) {
  if (!record) return;
  await Promise.allSettled(Array.from({ length: record.count }, (_, i) => remove(partKey(key, record, i))));
}

/** The manifest changes only after all new chunks are durable. */
const secureItems = {
  async getItem(key: string) {
    const record = readManifest(await read(key));
    if (!record) return null;
    const parts = await Promise.all(Array.from({ length: record.count }, (_, i) => read(partKey(key, record, i))));
    if (parts.some((part) => part === null)) throw new Error("Session storage is incomplete");
    return decodeURIComponent(parts.join(""));
  },
  async setItem(key: string, value: string) {
    const previous = readManifest(await read(key));
    const encoded = encodeURIComponent(value);
    const count = Math.max(1, Math.ceil(encoded.length / partSize));
    if (count > maxParts) throw new Error("Session storage limit exceeded");
    const record = { prefix: randomUUID(), count };
    const writes = await Promise.allSettled(Array.from({ length: count }, (_, i) =>
      write(partKey(key, record, i), encoded.slice(i * partSize, (i + 1) * partSize))
    ));
    try {
      if (writes.some((result) => result.status === "rejected")) throw new Error("Could not save the session");
      await write(key, JSON.stringify(record));
    } catch (error) {
      await cleanup(key, record);
      throw error;
    }
    await cleanup(key, previous);
  },
  async removeItem(key: string) {
    const previous = readManifest(await read(key));
    await remove(key);
    await cleanup(key, previous);
  },
};

let queued: Promise<unknown> = Promise.resolve();
function serialize<T>(job: () => Promise<T>): Promise<T> {
  const next = queued.then(job);
  queued = next.catch(() => undefined);
  return next;
}

export const sessionStorage = {
  getItem(key: string) { return serialize(() => secureItems.getItem(key)); },
  setItem(key: string, value: string) { return serialize(() => secureItems.setItem(key, value)); },
  removeItem(key: string) { return serialize(() => secureItems.removeItem(key)); },
};

export async function databaseKey() {
  const name = "doordie.offline.key.v1";
  const existing = await read(name);
  if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
  if (existing) throw new Error("Offline storage key is unreadable");
  const { getRandomBytesAsync } = await import("expo-crypto");
  const key = Array.from(await getRandomBytesAsync(32), (byte) => byte.toString(16).padStart(2, "0")).join("");
  await write(name, key);
  return key;
}
