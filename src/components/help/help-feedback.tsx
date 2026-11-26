"use client";

/* ════════════════════════════════════════════════════════════════
   HELP & FEEDBACK
   Available from the quick actions dock for signed-in accounts. It opens a
   panel to send the team a bug report, an idea or a question (with a
   screenshot if it helps), to read their answers, and to switch automatic
   crash reports on or off.

   Everything goes to the Feedback Center in the Admin Center, as the
   signed-in account. Nothing is emailed and no email address is collected:
   the team answers here, and the bell says when they have.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Bug } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { FEEDBACK_MIN_LENGTH } from "@/lib/report";
import { apiCall, ApiError } from "@/lib/platform/client";
import type { MyFeedback } from "@/lib/platform/types";
import { useInbox } from "@/components/platform/inbox";
import { useAccountUpdates, usePlatformUpdates } from "@/components/platform/live-updates";
import { useAccount } from "@/components/account/account-session";
import { Modal } from "@/components/ui/modal";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { EMPTY_DRAFT, FeedbackForm, technicalDetails, type FeedbackDraft, type FormState } from "./feedback-form";
import { FeedbackHistory } from "./feedback-history";

export type HelpView = "send" | "messages";

interface HelpValue {
  /** Opens the panel, on "Your messages" when the team has answered something unread, else on a new message. */
  open: (view?: HelpView) => void;
  isOpen: boolean;
  unseen: number;
}

const HelpContext = createContext<HelpValue | null>(null);

/** Null where Help & feedback isn't offered: signed out, the demo, or a build without accounts. */
export const useHelpFeedback = () => useContext(HelpContext);

type Sent = MyFeedback & { screenshot: "stored" | "failed" | null };

/**
 * Wraps the app's shell. With `enabled` off it adds nothing at all: no
 * button, no panel, no requests.
 */
export function HelpFeedback({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <HelpFeedbackOn>{children}</HelpFeedbackOn>;
}

function HelpFeedbackOn({ children }: { children: React.ReactNode }) {
  const { user } = useAccount();
  const inbox = useInbox();
  const unseen = inbox?.unseenResponses ?? 0;
  const unseenRef = useRef(unseen);
  unseenRef.current = unseen;

  const [isOpen, setOpen] = useState(false);
  const [view, setView] = useState<HelpView>("send");
  const [draft, setDraftState] = useState<FeedbackDraft>(EMPTY_DRAFT);
  const [form, setForm] = useState<FormState>({ kind: "editing", error: null });
  const [preparing, setPreparing] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [history, setHistory] = useState<MyFeedback[] | null>(null);
  const [available, setAvailable] = useState(true);

  const open = useCallback((next?: HelpView) => {
    setView(next ?? (unseenRef.current > 0 ? "messages" : "send"));
    // A message sent last time: start a fresh one, keeping nothing but the choices.
    setForm((f) => (f.kind === "sent" ? { kind: "editing", error: null } : f));
    setOpen(true);
  }, []);
  const value = useMemo<HelpValue>(() => ({ open, isOpen, unseen }), [open, isOpen, unseen]);

  // A screenshot's preview is an object URL: let it go when the screenshot is replaced, removed or sent.
  const setDraft = useCallback((patch: Partial<FeedbackDraft>) => {
    setDraftState((d) => {
      if ("shot" in patch && d.shot && d.shot !== patch.shot) URL.revokeObjectURL(d.shot.preview);
      return { ...d, ...patch };
    });
    setForm((f) => (f.kind === "editing" && f.error ? { kind: "editing", error: null } : f));
  }, []);

  // The person's messages and the team's answers, read each time the panel opens.
  const loadHistory = useCallback(() => {
    void apiCall<{ items: MyFeedback[] }>("/api/feedback").then(
      (d) => {
        setHistory(d.items);
        setAvailable(true);
      },
      (e: unknown) => {
        if (e instanceof ApiError && e.status === 503) setAvailable(false);
        setHistory((h) => h ?? []);
      },
    );
  }, []);
  useEffect(() => {
    if (isOpen) loadHistory();
  }, [isOpen, loadHistory]);
  // While it's open, the team's answer or a new status shows up without a reload.
  // The team answered or changed a status, or this account sent one from another device; or a linked update was published.
  useAccountUpdates(user?.id, ["feedback"], loadHistory, isOpen);
  usePlatformUpdates(["changelog"], loadHistory, isOpen);

  async function send() {
    const message = draft.message.trim();
    if (message.length < FEEDBACK_MIN_LENGTH) {
      setForm({ kind: "editing", error: `Write at least ${FEEDBACK_MIN_LENGTH} characters, so there's something to go on.` });
      return;
    }
    setForm({ kind: "sending" });
    try {
      const sent = await apiCall<Sent>("/api/feedback", {
        method: "POST",
        body: {
          category: draft.topic,
          message,
          includeDetails: draft.includeDetails,
          context: draft.includeDetails ? technicalDetails() : {},
          screenshot: draft.shot ? { type: draft.shot.type, data: draft.shot.data } : null,
        },
      });
      const { screenshot, ...item } = sent;
      setHistory((h) => [{ ...item, hasScreenshot: screenshot === "stored" }, ...(h ?? []).filter((x) => x.id !== item.id)]);
      setDraft({ message: "", shot: null });
      setForm({ kind: "sent", screenshotFailed: screenshot === "failed" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 503) setAvailable(false);
      setForm({ kind: "editing", error: e instanceof Error ? e.message : "That didn't send. Try again." });
    }
  }

  return (
    <HelpContext.Provider value={value}>
      {children}
      <Modal
        open={isOpen}
        onClose={() => setOpen(false)}
        title="Help & feedback"
        description="Bugs, ideas and questions go straight to the team."
        placement="corner"
        className="sm:max-w-md"
      >
        <Segmented
          label="Help & feedback"
          options={[
            { value: "send", label: "New message" },
            { value: "messages", label: unseen > 0 ? `Your messages · ${unseen} new` : "Your messages" },
          ]}
          value={view}
          onChange={setView}
          className="mb-5"
        />
        {view === "send" ? (
          <>
            <FeedbackForm
              draft={draft}
              onDraft={setDraft}
              state={form}
              onSend={() => void send()}
              onAnother={() => setForm({ kind: "editing", error: null })}
              onSeeMessages={() => {
                setForm({ kind: "editing", error: null });
                setView("messages");
              }}
              available={available}
              preparing={preparing}
              onPreparing={setPreparing}
            />
            <CrashReportsSetting />
          </>
        ) : history === null ? (
          <Skeleton className="h-28 w-full rounded-2xl" />
        ) : history.length ? (
          <FeedbackHistory items={history} onSeen={() => inbox?.responsesSeen()} />
        ) : (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm font-medium text-paper">Nothing sent yet</p>
            <p className="mt-1 text-xs leading-relaxed text-paper/55">What you send, and the team&apos;s answers, will appear here.</p>
            <Button size="sm" variant="ghost" className="mt-3" onClick={() => setView("send")}>
              Write a message
            </Button>
          </div>
        )}
      </Modal>
    </HelpContext.Provider>
  );
}

/** Automatic crash reports: the account's choice, saved with it. */
function CrashReportsSetting() {
  const on = useChronicle((s) => s.profile.crashReports !== false);
  const updateProfile = useChronicle((s) => s.updateProfile);
  return (
    <section aria-labelledby="help-crash-title" className="mt-6 border-t border-line pt-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="help-crash-title" className="flex items-center gap-2 text-sm font-semibold text-paper">
            <Bug className="h-4 w-4 text-accent" aria-hidden /> Crash reports
          </h3>
          <p id="help-crash-hint" className="mt-1 text-xs leading-relaxed text-paper/55">
            When something breaks, the app sends the team the error, the page&apos;s address and your browser. Never your name,
            your account or anything you wrote. On the error screen you can add a note, and it goes only if you press Send.
          </p>
        </div>
        <Switch
          label="Send crash reports automatically"
          describedBy="help-crash-hint"
          checked={on}
          onChange={(v) => updateProfile({ crashReports: v })}
        />
      </div>
    </section>
  );
}

export function helpButtonLabel(unseen: number) {
  if (!unseen) return "Help & feedback";
  return `Help & feedback: the team answered ${unseen === 1 ? "a message" : `${unseen} messages`}`;
}
