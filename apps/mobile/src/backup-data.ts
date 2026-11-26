import { SNAPSHOT_KEYS, STORE_VERSION, type CloudSnapshot } from "../../../src/lib/chronicle-store";
import { dropForeignFiles } from "../../../src/lib/files";
import { mergeTwoWay } from "../../../src/lib/sync/merge";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function parseBackup(value: unknown, accountId: string, current: CloudSnapshot): Partial<CloudSnapshot> {
  if (!object(value) || value.app !== "the-upsc-chronicle" || !object(value.account) || value.account.id !== accountId ||
      !Number.isInteger(value.schemaVersion) || Number(value.schemaVersion) < 1 ||
      Number(value.schemaVersion) > STORE_VERSION || !object(value.data)) {
    throw new Error("Choose a supported DoOrDie backup exported from this account.");
  }
  const data: Record<string, unknown> = {};
  for (const key of SNAPSHOT_KEYS) {
    if (!Object.hasOwn(value.data, key)) continue;
    const item = value.data[key];
    const expected = current[key];
    const valid = Array.isArray(expected)
      ? Array.isArray(item) && item.every((entry) => typeof entry === (key === "accomplished" ? "string" : "object") && entry !== null && !Array.isArray(entry))
      : expected && typeof expected === "object" ? object(item) : typeof item === typeof expected;
    if (!valid) throw new Error("This backup contains invalid account data.");
    data[key] = item;
  }
  if (!Object.keys(data).length) throw new Error("This backup has no account data.");
  if (Array.isArray(data.files) && !data.files.every((file) => object(file) && typeof file.path === "string" && typeof file.id === "string")) {
    throw new Error("This backup contains invalid file records.");
  }
  const withFiles = Array.isArray(data.files) ? data : { ...data, files: [] };
  // All restored records pass through normal snapshot hydration and versioned
  // sync. Existing local values win on conflict and missing data is kept.
  const safe = dropForeignFiles(withFiles as Partial<CloudSnapshot>, accountId);
  return mergeTwoWay(current, safe as CloudSnapshot, "local").value;
}
