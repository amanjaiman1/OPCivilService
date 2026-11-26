import "react-native-url-polyfill/auto";
import Constants from "expo-constants";
import { toByteArray } from "base64-js";
import { createClient } from "@supabase/supabase-js";
import { sessionStorage } from "./credentials";
import { ensurePkceCrypto } from "./pkce";

ensurePkceCrypto();

export const cloudUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const url = cloudUrl;
const publicKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const appUrl = process.env.EXPO_PUBLIC_APP_URL;
const scheme = Constants.expoConfig?.scheme;
export const authCallback = typeof scheme === "string" ? `${scheme}://auth/callback` : undefined;

function isPublishableKey(key: string) {
  if (key.startsWith("sb_publishable_")) return true;
  try {
    const body = key.split(".")[1];
    if (!body) return false;
    const base64 = body.replace(/-/g, "+").replace(/_/g, "/");
    const data = toByteArray(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
    return JSON.parse(new TextDecoder().decode(data)).role === "anon";
  } catch { return false; }
}

export const authClient = url && publicKey && url.startsWith("https://") && isPublishableKey(publicKey)
  ? createClient(url, publicKey, {
      auth: { storage: sessionStorage, storageKey: "doordie.auth.v1", flowType: "pkce", detectSessionInUrl: false },
    })
  : null;

export function scopedClient(accessToken: () => Promise<string>) {
  if (!url || !publicKey || !authClient) throw new Error("Cloud configuration is unavailable");
  return createClient(url, publicKey, { accessToken });
}

export async function deleteCloudAccount(
  accountId: string,
  email: string,
  password: string,
  active: () => boolean,
) {
  if (!url || !publicKey || !authClient || !appUrl) throw new Error("Account deletion is not configured");
  const target = new URL("/api/account/delete", appUrl);
  if (target.protocol !== "https:" || target.username || target.password) throw new Error("Invalid account service");
  const temporary = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "doordie.reauth.v1" },
  });
  try {
    const result = await temporary.auth.signInWithPassword({ email, password });
    if (result.error || result.data.session?.user.id !== accountId || !active()) {
      throw new Error("Reauthentication failed");
    }
    const response = await fetch(target.href, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${result.data.session.access_token}` },
      body: JSON.stringify({ confirm: "DELETE" }),
    });
    if (!response.ok) throw new Error("Account deletion did not complete");
  } finally {
    await temporary.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
