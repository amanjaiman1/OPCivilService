import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, AppState, Modal, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Action, Card, Copy, Field, Page, Row, usePalette } from "./ui";
import { useAccount, useChronicle, useSession } from "./session";
import { appUrl, deleteCloudAccount } from "./cloud";
import { PushControl } from "./push";
import { selectBackup, shareBackup } from "./backup";
import { noticeRoute } from "./push-routing";
import type { AuthorReview, MyAnnouncements, MyFeedback, MyReview } from "../../../src/lib/platform/types";
import { parseFeedbackSubmission, parseReviewFields } from "../../../src/lib/platform/validate";
import { buildInbox, evaluate } from "../../../src/lib/notifications";
import { toISODate } from "../../../src/lib/utils";

function useCloud<T>(name: string) {
  const { client } = useAccount();
  const { liveVersion } = useSession();
  const [value, setValue] = useState<T>();
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [generation, setGeneration] = useState(0);
  const latestGeneration = useRef(0);
  const latestLive = useRef(liveVersion);
  latestLive.current = liveVersion;
  useFocusEffect(useCallback(() => {
    let active = true;
    setStatus("loading");
    void Promise.resolve(client.rpc(name)).then(({ data, error }) => {
      if (!active || generation !== latestGeneration.current || liveVersion !== latestLive.current) return;
      if (error) setStatus("error");
      else { setValue(data as T); setStatus("ready"); }
    }).catch(() => { if (active && generation === latestGeneration.current) setStatus("error"); });
    return () => { active = false; };
  }, [client, name, generation, liveVersion]));
  return { value, status, refresh: () => setGeneration(++latestGeneration.current) };
}

export function Announcements() {
  const { client } = useAccount();
  const inbox = useCloud<MyAnnouncements>("platform_my_announcements");
  const [message, setMessage] = useState("");
  const items = inbox.value?.items ?? [];
  return <Page title="Announcements">
    {inbox.value?.notice && <Card title="Platform notice"><Copy>{inbox.value.notice.message}</Copy></Card>}
    {inbox.status === "error" && <Copy live>Could not refresh announcements. Check your connection.</Copy>}
    {inbox.status === "loading" && <Copy muted>Checking for updates…</Copy>}
    <Action label="Refresh announcements" onPress={inbox.refresh} />
    {items.slice(0, 25).map((item) => <Card key={item.id} title={item.title}>
      <Copy muted>{item.readAt ? "" : "New · "}{item.startsAt.slice(0, 10)}</Copy><Copy>{item.body}</Copy>
    </Card>)}
    {inbox.status === "ready" && !items.length && <Copy muted>No announcements yet.</Copy>}
    {items.some((item) => !item.readAt) && <Action label="Mark announcements read" onPress={() => void client.rpc("platform_mark_announcements_read").then(({ error }) => {
      if (error) setMessage("Could not mark announcements read.");
      else { setMessage(""); inbox.refresh(); }
    })} />}
    {message && <Copy live>{message}</Copy>}
  </Page>;
}

export function Feedback() {
  const { client } = useAccount();
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const inbox = useCloud<{ items: MyFeedback[] }>("platform_my_feedback");
  async function send() {
    const result = parseFeedbackSubmission({ category: "general", message: text });
    if (!result.ok) { setMessage(result.error); return; }
    setSubmitting(true);
    try {
      const { error } = await client.rpc("platform_submit_feedback", { p_fields: { category: result.value.category, message: result.value.message } });
      if (error) throw error;
      setText("");
      setMessage("Message sent.");
      inbox.refresh();
    } catch { setMessage("Could not send the message. Check your connection and try again."); }
    finally { setSubmitting(false); }
  }
  const items = inbox.value?.items ?? [];
  return <Page title="Help & feedback">
    <Card title="Send a message">
      <Copy muted>The team replies here. Include only the information you want to share.</Copy>
      <Field label="Message" multiline value={text} onChangeText={setText} maxLength={4000} />
      <Action label={submitting ? "Sending…" : "Send feedback"} disabled={submitting || text.trim().length < 10} primary onPress={() => void send()} />
      {message && <Copy live>{message}</Copy>}
    </Card>
    <Card title="Your messages">
      <Action label="Refresh messages" onPress={inbox.refresh} />
      {inbox.status === "error" && <Copy live>Could not load messages. Check your connection.</Copy>}
      {inbox.status === "ready" && !items.length && <Copy muted>No messages yet.</Copy>}
      {items.slice(0, 25).map((item) => <Card key={item.id} title={item.response && !item.responseSeen ? "New reply" : item.status}>
        <Copy>{item.message}</Copy>
        {item.response && <Copy>{item.response}</Copy>}
        <Copy muted>{item.createdAt?.slice(0, 10)}</Copy>
      </Card>)}
      {items.some((item) => item.response && !item.responseSeen) && <Action label="Mark replies seen" onPress={() => void client.rpc("platform_mark_feedback_seen").then(({ error }) => {
        if (error) setMessage("Could not mark replies seen.");
        else inbox.refresh();
      })} />}
    </Card>
  </Page>;
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
export function ReviewInvitation() {
  const { client } = useAccount();
  const router = useRouter();
  const [claim, setClaim] = useState<string>();
  const [report, setReport] = useState("");
  const p = usePalette();
  useFocusEffect(useCallback(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;
    function check() {
      if (!alive || AppState.currentState !== "active" || running || timer) return;
      timer = setTimeout(() => { timer = undefined; void claimIt(); }, 2500);
    }
    async function claimIt() {
      if (!alive || AppState.currentState !== "active") return;
      running = true;
      const id = randomUUID();
      const claimRpc = (action: string) => client.rpc("platform_claim_review_invitation", { p_action: action, p_id: id, p_zone: zone() });
      let reserved = false;
      let shown = false;
      try {
        reserved = (await claimRpc("reserve")).data === true;
        if (!alive || AppState.currentState !== "active" || !reserved) return;
        shown = (await claimRpc("show")).data === true;
        if (alive && AppState.currentState === "active" && shown) setClaim(id);
      } catch {
        // Optional engagement can be checked on a later foreground visit.
      } finally {
        if (reserved && !shown) void Promise.resolve(claimRpc("release")).catch(() => undefined);
        running = false;
      }
    }
    const sub = AppState.addEventListener("change", check);
    check();
    return () => {
      alive = false;
      clearTimeout(timer);
      sub.remove();
      setClaim(undefined);
    };
  }, [client]));

  async function answer(action: "postpone" | "dismiss") {
    try {
      const { data } = await client.rpc("platform_claim_review_invitation", { p_action: action, p_id: claim, p_zone: zone() });
      if (data !== true) throw new Error();
      setClaim(undefined);
      setReport("");
    } catch { setReport("Could not save your choice. Try again or close for today."); }
  }
  return <Modal visible={!!claim} transparent onRequestClose={() => setClaim(undefined)} animationType="none">
    <View accessibilityViewIsModal style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#130a2680" }}>
      <View style={{ backgroundColor: p.panel, borderRadius: 24 }}>
        <Card title="How is your DoOrDie experience?">
          <Copy>You choose whether your review can be published.</Copy>
          {report && <Copy live>{report}</Copy>}
          <Action label="Write a review" primary onPress={() => {
            setClaim(undefined);
            router.push({ pathname: "/module/[name]", params: { name: "review", source: "invitation" } });
          }} />
          <Action label="Maybe later" onPress={() => void answer("postpone")} />
          <Action label="Don’t ask me again" onPress={() => void answer("dismiss")} />
          <Action label="Close for today" onPress={() => setClaim(undefined)} />
        </Card>
      </View>
    </View>
  </Modal>;
}

export function ProductReview() {
  const args = useLocalSearchParams<{ source?: string }>();
  const { client } = useAccount();
  const view = useCloud<MyReview>("platform_my_review");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [consent, setConsent] = useState(false);
  const [publicConsent, setPublicConsent] = useState(false);
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);
  const [editing, setEditing] = useState<AuthorReview>();
  const existing = view.value?.review;
  function edit(review: AuthorReview) {
    setRating(review.rating); setBody(review.body ?? "");
    setConsent(review.feedbackConsent); setPublicConsent(review.publicConsent);
    setMessage(""); setEditing(review);
  }
  async function save() {
    if (editing && existing?.updatedAt !== editing.updatedAt) {
      setMessage("This review changed. Cancel editing and open the latest version."); return;
    }
    const fields = parseReviewFields({
      ...editing, rating, body: body.trim(), displayPreference: editing?.displayPreference ?? "anonymous", feedbackConsent: consent,
      publicConsent, source: editing?.source ?? (args.source === "invitation" ? "invitation" : "settings"),
    });
    if (!fields.ok) { setMessage(fields.error); return; }
    setWorking(true);
    try {
      const { error } = await client.rpc("platform_submit_review", { p_fields: fields.value });
      if (error) throw error;
      setMessage(editing ? "Review changes submitted." : "Review sent.");
      setEditing(undefined);
      view.refresh();
    } catch { setMessage("Could not send the review. Check the form and your connection."); }
    finally { setWorking(false); }
  }
  return <Page title="Review DoOrDie">
    {view.status === "loading" && <Copy muted>Checking review availability…</Copy>}
    {view.status === "error" && <Action label="Retry" onPress={view.refresh} />}
    {message && <Copy live>{message}</Copy>}
    {existing && !editing ? <Card title={existing.status}>
      <Copy>{existing.rating} of 5 stars</Copy>
      {existing.body && <Copy>{existing.body}</Copy>}
      {view.value?.open && <Action label="Edit review" disabled={working} onPress={() => edit(existing)} />}
      <Action label="Delete review" disabled={working} onPress={() => {
        Alert.alert("Delete your review?", "This permanently removes your submitted review.", [
          { text: "Cancel", style: "cancel" },
          { text: "Delete review", style: "destructive", onPress: () => void client.rpc("platform_delete_my_review").then(({ error }) => {
            if (error) setMessage("Could not delete the review.");
            else { setMessage("Review deleted."); view.refresh(); }
          }) },
        ]);
      }} />
      {existing.publicConsent && <Action label="Withdraw public consent" onPress={() => {
        Alert.alert("Withdraw public consent?", "The team will keep your product feedback.", [
          { text: "Cancel", style: "cancel" },
          { text: "Withdraw", onPress: () => void client.rpc("platform_withdraw_review").then(({ error }) => {
            if (error) setMessage("Could not withdraw the review.");
            else view.refresh();
          }) },
        ]);
      }} />}
    </Card> : view.value?.open && (editing || view.value.eligibility.eligible) ? <Card title={editing ? "Edit review" : "Share your experience"}>
      <Row>{[1, 2, 3, 4, 5].map((star) => <Action key={star} label={`${star} stars`} selected={star === rating} primary={star === rating} onPress={() => setRating(star)} />)}</Row>
      <Field label="Review" multiline maxLength={1500} value={body} onChangeText={setBody} />
      <Action label={consent ? "Feedback consent granted" : "Allow the team to use this review as feedback"} selected={consent} onPress={() => setConsent(!consent)} />
      <Action label={publicConsent ? "Publication consent granted" : editing && editing.displayPreference !== "anonymous" ? "Allow publication with your existing display preference" : "Allow anonymous publication (optional)"} selected={publicConsent} onPress={() => setPublicConsent(!publicConsent)} />
      {editing && <Action label="Cancel editing" disabled={working} onPress={() => setEditing(undefined)} />}
      <Action label={editing ? "Submit changes" : "Submit review"} primary disabled={working || !consent || !rating || (publicConsent && body.trim().length < 30)} onPress={() => void save()} />
    </Card> : view.status === "ready" && <Copy muted>Reviews are currently unavailable for this account.</Copy>}
  </Page>;
}

export function Notices() {
  const router = useRouter();
  const { store } = useAccount();
  const state = useChronicle((s) => s);
  const now = new Date();
  const notices = buildInbox(evaluate(state, { now, settings: state.notify }), state.notifyState, toISODate(now));
  return <Page title="Notifications">
    {notices.items.slice(0, 30).map((item) => <Card key={item.id} title={item.title}>
      <Copy>{item.body}</Copy>
      <Row>{noticeRoute(item.href) && <Action label={item.cta} primary onPress={() => {
        const route = noticeRoute(item.href);
        if (route) { store.getState().markNoticeRead(item.id); router.push(route); }
      }} />}
        {!item.read && <Action label="Mark read" onPress={() => store.getState().markNoticeRead(item.id)} />}
        <Action label="Dismiss" onPress={() => store.getState().dismissNotice(item.id)} /></Row>
    </Card>)}
    {!notices.items.length && <Copy muted>No current notifications.</Copy>}
  </Page>;
}

export function Settings() {
  const router = useRouter();
  const account = useAccount();
  const { store } = account;
  const { session, signOut, removeLocalAccount } = useSession();
  const profile = useChronicle((s) => s.profile);
  const mode = useChronicle((s) => s.themeMode);
  const notify = useChronicle((s) => s.notify.enabled);
  const deliver = useChronicle((s) => s.notify.deliver);
  const [name, setName] = useState(profile.name);
  const [message, setMessage] = useState("");
  const [keep, setKeep] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [working, setWorking] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  async function exit(keepLocal: boolean) {
    setWorking(true);
    try {
      if (await signOut(keepLocal)) router.replace("/");
      else {
        setMessage("Changes could not be synced. Retry online or keep the encrypted copy on this device.");
        setKeep(true);
      }
    } catch { setMessage("The sign-out did not finish."); }
    finally { setWorking(false); }
  }

  async function remove() {
    if (!session?.user.email || !account.isActive() || confirmation !== "DELETE") return;
    setWorking(true);
    try {
      await deleteCloudAccount(account.id, session.user.email, password, account.isActive);
      setPassword("");
      await removeLocalAccount();
      router.replace("/");
    } catch {
      setPassword("");
      setMessage("Account deletion could not be confirmed. Verify your password and try again online.");
    } finally { setWorking(false); }
  }

  function exportBackup(recovery: boolean) {
    Alert.alert("Export a private copy?", "Your export may contain diary, study and health records. Choose a destination you trust.", [
      { text: "Cancel", style: "cancel" },
      { text: "Export", onPress: () => void shareBackup(account, recovery).catch(() => setMessage("The backup could not be shared.")) },
    ]);
  }

  async function importBackup() {
    setWorking(true);
    try {
      const restore = await selectBackup(account);
      if (!restore) return;
      Alert.alert("Merge this backup?", "Add records from this account’s backup while retaining current records on this device.", [
        { text: "Cancel", style: "cancel" },
        { text: "Merge records", onPress: () => {
          try { if (restore()) setMessage("Backup merged. Account sync will apply the usual version checks."); }
          catch { setMessage("The backup could not be merged."); }
        } },
      ]);
    } catch (error) { setMessage(error instanceof Error ? error.message : "The backup could not be read."); }
    finally { setWorking(false); }
  }

  return <Page title="Settings">
    <Card title="Profile"><Copy muted>{session?.user.email}</Copy>
      <Field label="Name" maxLength={80} value={name} onChangeText={setName} />
      <Action label="Save name" disabled={!name.trim() || name.trim() === profile.name} onPress={() => store.getState().updateProfile({ name: name.trim() })} />
    </Card>
    <Card title="Appearance"><Row>{(["light", "dark", "lavender"] as const).map((item) =>
      <Action key={item} label={item} selected={item === mode} primary={item === mode} onPress={() => store.getState().setThemeMode(item)} />)}</Row>
    </Card>
    <Card title="Engagement">
      <Action label="Quick tour" onPress={() => router.push({ pathname: "/module/[name]", params: { name: "tour" } })} />
      <Action label={deliver ? "Pause device push for this account" : "Allow device push for this account"} selected={deliver}
        onPress={() => store.getState().updateNotifySettings({ deliver: !deliver })} />
      <PushControl />
      <Action label={notify ? "Turn off study reminders" : "Turn on study reminders"} selected={notify}
        onPress={() => store.getState().updateNotifySettings({ enabled: !notify })} />
      <Action label="Review DoOrDie" onPress={() => router.push({ pathname: "/module/[name]", params: { name: "review" } })} />
    </Card>
    <Card title="Account">
      <Action label="Import account backup" disabled={working} onPress={() => void importBackup()} />
      <Action label="Export account snapshot" disabled={working} onPress={() => exportBackup(false)} />
      {account.readRecovery() && <Action label="Export preserved recovery copy" disabled={working} onPress={() => exportBackup(true)} />}
      <Action label="Sign out" disabled={working} onPress={() => void exit(false)} />
      {keep && <Action label="Sign out and keep local changes" disabled={working} onPress={() => {
        Alert.alert("Keep encrypted records on this device?", "Sign in to the same account to recover these changes. Another account cannot open them.", [
          { text: "Cancel", style: "cancel" }, { text: "Sign out", onPress: () => void exit(true) },
        ]);
      }} />}
      {appUrl?.startsWith("https://") && !deleting && <Action label="Delete account" disabled={working} onPress={() => setDeleting(true)} />}
      {deleting && <>
        <Copy>Deletion is permanent and removes the account and its records from DoOrDie.</Copy>
        <Field label="Current password" secureTextEntry value={password} onChangeText={setPassword} />
        <Field label="Type DELETE to confirm" value={confirmation} autoCapitalize="characters" onChangeText={setConfirmation} />
        <Action label="Permanently delete account" disabled={working || !password || confirmation !== "DELETE"} onPress={() => void remove()} />
        <Action label="Cancel deletion" disabled={working} onPress={() => { setDeleting(false); setPassword(""); setConfirmation(""); }} />
      </>}
      {message && <Copy live>{message}</Copy>}
    </Card>
  </Page>;
}
