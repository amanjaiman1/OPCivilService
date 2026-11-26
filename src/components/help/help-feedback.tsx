"use client";

/* ════════════════════════════════════════════════════════════════
   HELP & FEEDBACK
   Available from the mobile dock or a desktop corner button for signed-in
   accounts. It opens a
   panel to send the team a bug report, an idea or a question (with a
   screenshot if it helps), to read their answers, and to switch automatic
   crash reports on or off.

   Everything goes to the Feedback Center in the Admin Center, as the
   signed-in account. Nothing is emailed and no email address is collected:
   the team answers here, and the bell says when they have.
   ════════════════════════════════════════════════════════════════ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Bug, MessageCircleQuestion, X } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { useMounted } from "@/lib/hooks";
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
import { cn } from "@/lib/utils";
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

/** The room the button takes above the bottom edge, so toasts and prompts sit above it. */
const FAB_SPACE = "4rem";

type Sent = MyFeedback & { screenshot: "stored" | "failed" | null };

/**
 * Wraps the app's shell. With `enabled` off it adds nothing at all: no
 * button, no panel, no requests.
 */
export function HelpFeedback({ enabled, desktop, children }: { enabled: boolean; desktop: boolean; children: React.ReactNode }) {
  if (!enabled) return <>{children}</>;
  return <HelpFeedbackOn desktop={desktop}>{children}</HelpFeedbackOn>;
}

function HelpFeedbackOn({ desktop, children }: { desktop: boolean; children: React.ReactNode }) {
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
      {desktop && <HelpButton open={isOpen} unseen={unseen} onClick={() => (isOpen ? setOpen(false) : open())} />}
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

/** The desktop button also closes the panel while it is open. */
function HelpButton({ open, unseen, onClick }: { open: boolean; unseen: number; onClick: () => void }) {
  const mounted = useMounted();

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--help-fab-space", FAB_SPACE);
    return () => {
      root.style.removeProperty("--help-fab-space");
    };
  }, []);

  if (!mounted) return null;
  const label = helpButtonLabel(unseen);

  return createPortal(
    <motion.div
      className={cn(
        "fixed bottom-5 right-5 hidden lg:block",
        open ? "z-[55]" : "z-40",
      )}
      initial={{ opacity: 0, scale: 0.5, y: 14 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 24, delay: 0.5 }}
    >
      {!open && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 rounded-full bg-accent/40",
            unseen > 0 ? "motion-safe:animate-help-halo-loop" : "motion-safe:animate-help-halo",
          )}
        />
      )}
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={open ? "Close Help & feedback" : label}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-testid="help-feedback-button"
        whileHover={{ scale: 1.07 }}
        whileTap={{ scale: 0.92 }}
        transition={{ type: "spring", stiffness: 500, damping: 28 }}
        className="group relative grid h-12 w-12 place-items-center rounded-full bg-accent text-accent-fg shadow-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/45 focus-visible:ring-offset-2 focus-visible:ring-offset-ink sm:h-[3.25rem] sm:w-[3.25rem]"
      >
        <AnimatePresence initial={false} mode="wait">
          <motion.span
            key={open ? "close" : "help"}
            initial={{ rotate: open ? -90 : 90, scale: 0.6, opacity: 0 }}
            animate={{ rotate: 0, scale: 1, opacity: 1 }}
            exit={{ rotate: open ? 90 : -90, scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="grid place-items-center"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden />
            ) : (
              <MessageCircleQuestion className="h-[1.35rem] w-[1.35rem] transition-transform duration-300 group-hover:-rotate-12" aria-hidden />
            )}
          </motion.span>
        </AnimatePresence>
        {unseen > 0 && !open && (
          <span className="tabular absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[0.62rem] font-bold leading-none text-ink ring-2 ring-[rgb(var(--card))]">
            {unseen > 9 ? "9+" : unseen}
          </span>
        )}
        {!open && (
          <span
            aria-hidden
            className="pointer-events-none absolute right-full top-1/2 mr-3 hidden -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-full border border-line bg-card px-3 py-1.5 text-xs font-semibold text-paper opacity-0 shadow-soft transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100 sm:block"
          >
            Help &amp; feedback
          </span>
        )}
      </motion.button>
    </motion.div>,
    document.body,
  );
}
