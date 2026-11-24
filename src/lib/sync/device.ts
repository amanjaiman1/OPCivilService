/**
 * A label for this browser, sent with saves and diagnostic events so the
 * account's trail can say which device did what ("android · app · 3f9a2c1d").
 * A random id kept device-wide (not per account), plus the platform and
 * whether the app runs installed. No fingerprinting, nothing personal; a
 * browser whose storage is cleared becomes a new device, which it is.
 */

import { readKey, writeKey } from "../account/scope";

const KEY = "upsc-chronicle-device";

function randomId(): string {
  try {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(16).slice(2, 10);
  }
}

function platform(): string {
  if (typeof navigator === "undefined") return "server";
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/mac os/i.test(ua)) return "mac";
  if (/windows/i.test(ua)) return "windows";
  if (/linux|cros/i.test(ua)) return "linux";
  return "other";
}

function displayMode(): string {
  try {
    return typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches
      ? "app"
      : "browser";
  } catch {
    return "browser";
  }
}

export function deviceLabel(): string {
  let id = readKey(KEY);
  if (!id || !/^[0-9a-f]{8}$/.test(id)) {
    id = randomId();
    writeKey(KEY, id);
  }
  return `${platform()} · ${displayMode()} · ${id}`;
}
