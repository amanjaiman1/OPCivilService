import { useState, type ReactNode } from "react";
import { Linking } from "react-native";
import { appUrl, authCallback, authClient } from "./cloud";
import { useAccount, useChronicle, useSession } from "./session";
import { isISODate } from "../../../src/lib/roadmap";
import { defaultSetup } from "../../../src/lib/seed";
import { Action, Card, Copy, Field, Page, Row } from "./ui";

function Authentication() {
  const { linkMessage, recovery, finishRecovery } = useSession();
  const [mode, setMode] = useState<"signIn" | "register" | "reset">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [working, setWorking] = useState(false);

  async function submit() {
    if (!authClient || working) return;
    setWorking(true);
    setMessage("");
    try {
      if ((mode === "register" || mode === "reset") && !recovery &&
          (!authCallback || typeof globalThis.TextEncoder !== "function" || typeof globalThis.btoa !== "function")) {
        throw new Error("Secure sign-in links are unavailable in this build");
      }
      if (recovery) {
        const { error } = await authClient.auth.updateUser({ password });
        if (error) throw error;
        setPassword("");
        finishRecovery();
      } else if (mode === "register") {
        const { data, error } = await authClient.auth.signUp({
          email: email.trim(), password, options: { emailRedirectTo: authCallback },
        });
        if (error) throw error;
        if (!data.session) setMessage("Check your email and open the verification link on this device.");
        setPassword("");
      } else if (mode === "reset") {
        const { error } = await authClient.auth.resetPasswordForEmail(email.trim(), { redirectTo: authCallback });
        if (error) throw error;
        setMessage("If this address has an account, open the reset link on this device.");
      } else {
        const { error } = await authClient.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        setPassword("");
      }
    } catch {
      setMessage(recovery ? "The password could not be updated. Try again or request a fresh link." :
        mode === "signIn" ? "Could not sign in. Check your connection and credentials, then try again." :
        "The request could not be completed. Check your details and connection, then try again.");
    } finally {
      setWorking(false);
    }
  }

  const label = recovery ? "Update password" : mode === "register" ? "Create account" : mode === "reset" ? "Send reset link" : "Sign in";
  return <Page title="DoOrDie" intro="Your UPSC preparation, documented.">
    {!authClient ? <Card title="Connection settings needed"><Copy>Set the public Supabase URL and key for this build.</Copy></Card> : <Card title={label}>
      {!recovery && <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />}
      {(recovery || mode !== "reset") && <Field label={recovery ? "New password" : "Password"} secureTextEntry
        autoComplete={recovery || mode === "register" ? "new-password" : "current-password"} value={password} onChangeText={setPassword} />}
      <Action label={working ? "Please wait…" : label} primary disabled={working || (!recovery && !email.trim()) || ((recovery || mode !== "reset") && !password)} onPress={() => void submit()} />
      {(message || linkMessage) && <Copy live>{message || linkMessage}</Copy>}
      {!recovery && <Row>
        {mode !== "signIn" && <Action label="Back to sign in" onPress={() => { setMode("signIn"); setMessage(""); }} />}
        {mode !== "register" && <Action label="Create an account" onPress={() => { setMode("register"); setMessage(""); }} />}
        {mode !== "reset" && <Action label="Forgot password" onPress={() => { setMode("reset"); setMessage(""); setPassword(""); }} />}
      </Row>}
    </Card>}
  </Page>;
}

function Onboarding() {
  const { store } = useAccount();
  const [settings, setSettings] = useState(defaultSetup);
  const [hours, setHours] = useState(String(settings.dailyHourTarget));
  const target = Number(hours);
  const valid = settings.name.trim() && settings.targetExam.trim() && isISODate(settings.examDate)
    && hours.trim() && Number.isFinite(target) && target >= 0.5 && target <= 24;
  return <Page title="Your chronicle" intro="Set your exam and daily study target.">
    <Card>
      <Field label="What should we call you?" maxLength={80} autoComplete="name" value={settings.name}
        onChangeText={(name) => setSettings({ ...settings, name })} />
      <Field label="Target exam" maxLength={100} value={settings.targetExam} onChangeText={(targetExam) => setSettings({ ...settings, targetExam })} />
      <Field label="Exam date (YYYY-MM-DD)" maxLength={10} value={settings.examDate} onChangeText={(examDate) => setSettings({ ...settings, examDate })} />
      <Field label="Daily study target (hours)" keyboardType="decimal-pad" maxLength={5} value={hours} onChangeText={setHours} />
      <Action label="Open my chronicle" primary disabled={!valid} onPress={() =>
        store.getState().completeOnboarding({ ...settings, name: settings.name.trim(), targetExam: settings.targetExam.trim(), dailyHourTarget: target })
      } />
    </Card>
  </Page>;
}

function AccountGate({ children }: { children: ReactNode }) {
  const { sync } = useSession();
  const { engine, cached } = useAccount();
  const profile = useChronicle((state) => state.profile);
  const stamp = useChronicle((state) => state._sync);
  if (sync?.status === "recovery") return <Page title="Account recovery" intro="The cloud could not identify your latest copy. Your local records are preserved.">
    <Action label="Check again" primary onPress={() => void engine.retry()} />
    {cached && profile.onboardedAt && <Action label="Restore cloud from this device" onPress={() => void engine.initialise("device")} />}
  </Page>;
  if (sync?.status === "outdated") return <Page title="Update needed" intro="Install a newer version of DoOrDie before editing this account." />;
  if (!stamp && sync?.status !== "synced") return <Page title="Opening your chronicle" intro="Connect once to verify this account before making entries.">
    {sync?.error && <Copy live>{sync.status === "offline" ? "You appear to be offline." : "The cloud copy could not be checked."}</Copy>}
    <Action label="Retry" onPress={() => void engine.retry()} />
  </Page>;
  if (!profile.onboardedAt) return <Onboarding />;
  return children;
}

export function Gate({ children }: { children: ReactNode }) {
  const { session, loading, account, storageError, webAdmin, restartAccount, recovery, signOut } = useSession();
  if (loading) return <Page title="DoOrDie" intro="Restoring your account…" />;
  if (!session || recovery) return <Authentication />;
  if (storageError) return <Page title="Offline storage unavailable" intro="Your saved records were kept. Reopen the account before making changes.">
    <Action primary label="Reopen account" onPress={restartAccount} />
  </Page>;
  if (webAdmin) return <Page title="Admin Center" intro="Use the secured web Admin Center with this account.">
    {appUrl?.startsWith("https://") && <Action primary label="Open Admin Center" onPress={() => void Linking.openURL(new URL("/admin", appUrl).href)} />}
    <Action label="Sign out" onPress={() => void signOut(true)} />
  </Page>;
  if (!account) return <Page title="Opening your chronicle" />;
  return <AccountGate>{children}</AccountGate>;
}
