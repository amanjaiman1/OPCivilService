import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { getDocumentAsync, type DocumentPickerAsset } from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { CryptoDigestAlgorithm, digest, randomUUID } from "expo-crypto";
import { ACCOUNT_FILE_QUOTA, ALLOWED_FILE_TYPES, MAX_FILE_BYTES, MAX_FILES_PER_ENTRY, FILE_BUCKET, checkFile, cleanFileName, extensionOf, filesByIds, storagePath, totalFileBytes } from "../../../src/lib/files";
import type { FileRecord } from "../../../src/lib/types";
import { cloudUrl } from "./cloud";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Row } from "./ui";

function cleanUp(file?: File) {
  try { if (file?.exists) file.delete(); } catch { /* cache is also subject to device eviction */ }
}

function assertOwned(path: string, account: string, hash: string) {
  if (!/^[a-f0-9]{64}$/.test(hash) || path !== storagePath(account, hash)) throw new Error("Invalid attachment path");
}

export function JournalFiles({ date }: { date: string }) {
  const account = useAccount();
  const files = useChronicle((s) => s.files);
  const entry = useChronicle((s) => s.journal.find((row) => row.date === date));
  const [picked, setPicked] = useState<DocumentPickerAsset>();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);
  useEffect(() => () => { if (picked) cleanUp(new File(picked.uri)); }, [picked]);
  if (!entry) return null;
  const listed = filesByIds(files, entry.fileIds);
  const bucket = account.client.storage.from(FILE_BUCKET);

  async function pick() {
    setMessage("");
    setBusy(true);
    try {
      const result = await getDocumentAsync({ type: ALLOWED_FILE_TYPES, multiple: false, copyToCacheDirectory: true });
      if (result.canceled) return;
      const item = result.assets[0];
      if (active.current && account.isActive()) setPicked(item);
      else cleanUp(new File(item.uri));
    } catch { setMessage("The file could not be opened."); }
    finally { setBusy(false); }
  }

  async function attach() {
    if (!picked || busy) return;
    const file = new File(picked.uri);
    setBusy(true);
    setMessage("");
    try {
      const type = checkFile({ name: picked.name, size: file.size, type: picked.mimeType ?? "" });
      if (!type.ok) { setMessage(type.reason); return; }
      if (file.size < 1 || file.size > MAX_FILE_BYTES) { setMessage("Choose a file no larger than 5 MB."); return; }
      const bytes = await file.arrayBuffer();
      if (bytes.byteLength < 1 || bytes.byteLength > MAX_FILE_BYTES) { setMessage("Choose a file no larger than 5 MB."); return; }
      const hash = Array.from(new Uint8Array(await digest(CryptoDigestAlgorithm.SHA256, bytes)), (n) => n.toString(16).padStart(2, "0")).join("");
      const state = account.store.getState();
      const existing = state.files.find((item) => item.sha256 === hash);
      const before = state.journal.find((row) => row.date === date);
      if (!before || !account.isActive() || !active.current) return;
      if (existing && before.fileIds?.includes(existing.id)) { setMessage("This file is already attached to this day."); setPicked(undefined); return; }
      if ((before.fileIds?.length ?? 0) >= MAX_FILES_PER_ENTRY) { setMessage("This day has reached its attachment limit."); return; }
      if (!existing && totalFileBytes(state.files) + bytes.byteLength > ACCOUNT_FILE_QUOTA) { setMessage("The account attachment quota would be exceeded."); return; }
      const record: FileRecord = existing ?? { id: `file-${hash}`, sha256: hash, path: storagePath(account.id, hash),
        name: cleanFileName(picked.name), type: type.def.type, size: bytes.byteLength, addedAt: new Date().toISOString() };
      assertOwned(record.path, account.id, record.sha256);
      if (!existing) {
        const result = await bucket.upload(record.path, bytes, { contentType: record.type, upsert: false });
        if (result.error) {
          const recovered = await bucket.info(record.path);
          if (recovered.error || Number(recovered.data?.size) !== record.size) throw result.error;
        }
      }
      if (!account.isActive() || !active.current) return;
      const latest = account.store.getState();
      const row = latest.journal.find((day) => day.date === date);
      if (!row) { setMessage("This journal day no longer exists. No file link was saved."); return; }
      if ((row.fileIds?.length ?? 0) >= MAX_FILES_PER_ENTRY && !row.fileIds?.includes(record.id)) {
        setMessage("This day has reached its attachment limit."); return;
      }
      latest.saveJournalEntry({ entry: { ...row, fileIds: [...new Set([...(row.fileIds ?? []), record.id])] }, newFiles: [record] });
      setPicked(undefined);
      setMessage("File attached. The link is saved on this device.");
    } catch { setMessage("Could not attach the file. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  async function share(record: FileRecord) {
    let local: File | undefined;
    setBusy(true);
    setMessage("");
    try {
      assertOwned(record.path, account.id, record.sha256);
      if (!(await isAvailableAsync())) throw new Error("Sharing unavailable");
      const { data, error } = await bucket.createSignedUrl(record.path, 60);
      if (error || !data) throw new Error("Could not prepare download");
      const url = new URL(data.signedUrl);
      if (url.protocol !== "https:" || !cloudUrl || url.origin !== new URL(cloudUrl).origin) throw new Error("Invalid download origin");
      const ext = extensionOf(record.name);
      local = new File(Paths.cache, `doordie-share-${randomUUID()}${ext ? `.${ext}` : ""}`);
      await File.downloadFileAsync(url.href, local);
      if (active.current && account.isActive()) await shareAsync(local.uri, { mimeType: record.type, dialogTitle: record.name });
    } catch { setMessage("The file could not be downloaded or shared."); }
    finally { cleanUp(local); setBusy(false); }
  }

  return <Card title="Attachments">
    {listed.map((record) => <Action key={record.id} label={`Share ${record.name}`} disabled={busy}
      onPress={() => Alert.alert("Share a private file?", "DoOrDie will download a temporary copy and open the system sharing menu.", [
        { text: "Cancel", style: "cancel" }, { text: "Download and share", onPress: () => void share(record) },
      ])} />)}
    {picked ? <><Copy>{picked.name}</Copy><Row>
      <Action label={busy ? "Uploading…" : "Confirm attachment"} primary disabled={busy} onPress={() => void attach()} />
      <Action label="Cancel" disabled={busy} onPress={() => setPicked(undefined)} />
    </Row></> : <Action label="Choose file" disabled={busy || listed.length >= MAX_FILES_PER_ENTRY} onPress={() => void pick()} />}
    {message && <Copy live>{message}</Copy>}
  </Card>;
}
