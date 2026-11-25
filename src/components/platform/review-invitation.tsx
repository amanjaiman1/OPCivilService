"use client";

import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { MessageSquareHeart, PenLine } from "lucide-react";
import { useChronicle } from "@/lib/store";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { hasOpenOverlay, Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { useTour } from "@/components/tour/tour-context";
import { useCapture } from "@/components/capture/capture-provider";

const ReviewWizard = lazy(() => import("@/components/settings/review-wizard").then((m) => ({ default: m.ReviewWizard })));

async function invitation(action: string, id: string) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const result = await supabase?.rpc("platform_claim_review_invitation", { p_action: action, p_id: id, p_zone: zone });
  if (result?.error) throw result.error;
  return result?.data === true;
}

export function ReviewInvitation({ userId, blocked }: { userId: string; blocked: boolean }) {
  const capture = useCapture();
  const tour = useTour();
  const busyOverlay = useRef(false);
  busyOverlay.current = blocked || capture.opened || tour.isOpen;
  const name = useChronicle((s) => s.profile.name);
  const [claim, setClaim] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [working, setWorking] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    let running = false;
    let refreshed = false;
    let shown = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function visible() {
      return document.visibilityState === "visible";
    }
    function ready() {
      return visible() && !busyOverlay.current && !hasOpenOverlay() &&
        !document.activeElement?.matches("input,textarea,select,[contenteditable=true]");
    }
    async function attempt(id: string) {
      if (!alive || !visible() || running || shown) return;
      running = true;
      let reserved = false;
      try {
        const { data } = await supabase!.auth.getSession();
        if (!alive || data.session?.user.id !== userId) return;
        reserved = await invitation("reserve", id);
        if (!reserved || !alive) return;
        // Never interrupt the initial tour, an entry, or another open dialog.
        const until = Date.now() + 25_000;
        while (alive && visible() && !ready() && Date.now() < until) {
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
        if (!alive || !ready()) return;
        shown = await invitation("show", id);
        if (shown && alive && ready()) setClaim(id);
      } catch {
        // Subsequent foreground opens can retry an unavailable claim.
      } finally {
        if (reserved && !shown && alive) void invitation("release", id).catch(() => undefined);
        running = false;
      }
    }
    function foreground() {
      if (!visible()) {
        refreshed = false;
        if (timer) clearTimeout(timer);
        return;
      }
      if (refreshed || shown || running) return;
      refreshed = true;
      timer = setTimeout(() => void attempt(crypto.randomUUID()), 2_500);
    }
    function blur() {
      refreshed = false;
      if (timer) clearTimeout(timer);
    }
    document.addEventListener("visibilitychange", foreground);
    window.addEventListener("blur", blur);
    window.addEventListener("focus", foreground);
    foreground();
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", foreground);
      window.removeEventListener("blur", blur);
      window.removeEventListener("focus", foreground);
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  async function answer(action: "postpone" | "dismiss") {
    if (!claim || working) return;
    setWorking(true);
    try {
      if (!(await invitation(action, claim))) throw new Error("Invitation is unavailable.");
      setClaim(null);
    } catch {
      toast({ title: "Your choice couldn’t be saved", description: "Try again, or close this invitation for today.", tone: "error" });
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <Modal open={claim !== null} onClose={() => setClaim(null)} title="How is your DoOrDie experience?"
        description="Your feedback helps us improve the platform for aspirants like you."
        className="sm:max-w-md"
        footer={<Button onClick={() => { setClaim(null); setWriting(true); }}><PenLine className="h-4 w-4" aria-hidden /> Write a review</Button>}
      >
        <div className="space-y-4">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/15 text-accent"><MessageSquareHeart className="h-5 w-5" aria-hidden /></span>
          <p className="text-sm text-paper/75">Share what helped and what could work better. You choose whether your review can be published.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={working} onClick={() => void answer("postpone")}>Maybe later</Button>
            <Button variant="ghost" disabled={working} onClick={() => void answer("dismiss")}>Don’t ask me again</Button>
          </div>
        </div>
      </Modal>
      {writing && <Suspense fallback={<p role="status" className="sr-only">Opening review form</p>}>
        <ReviewWizard open initial={null} defaultName={name.trim().split(/\s+/)[0] ?? ""} source="invitation"
          onClose={() => setWriting(false)}
          onSaved={() => { setWriting(false); toast({ title: "Review sent", description: "You can see its status in Settings.", tone: "success" }); }} />
      </Suspense>}
    </>
  );
}
