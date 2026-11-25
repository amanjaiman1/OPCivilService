"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import type { EntryGuide } from "@/lib/entry-guides";

export default function EntryGuideDialog({ guide, onClose, onTour }: {
  guide: EntryGuide;
  onClose: () => void;
  onTour?: () => void;
}) {
  const [step, setStep] = useState(0);
  const [practised, setPractised] = useState(false);
  const reduceMotion = useReducedMotion();
  const last = guide.steps.length;
  return (
    <Modal open onClose={onClose} title={guide.title} description="Practice with a sample. Your records stay untouched."
      footer={
        <>
          {onTour && <Button variant="ghost" size="sm" className="mr-auto" onClick={onTour}>Full tour</Button>}
          {step > 0 && <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}><ChevronLeft className="h-4 w-4" /> Back</Button>}
          {step < last ? <Button size="sm" onClick={() => setStep(step + 1)}>Next <ChevronRight className="h-4 w-4" /></Button>
            : <Button size="sm" onClick={onClose}>Done</Button>}
        </>
      }
    >
      <div className="min-h-32 space-y-3">
        <p className="text-xs font-semibold text-paper/65">{step < last ? `Step ${step + 1} of ${last}` : "Try it"}</p>
        <AnimatePresence initial={false}>
          <motion.div key={step} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.16 }} aria-live="polite">
            {step < last ? <p className="text-sm leading-relaxed text-paper">{guide.steps[step]}</p> : (
              <div className="space-y-3">
                <Button variant="outline" aria-pressed={practised} onClick={() => setPractised(!practised)}>
                  {practised && <Check className="h-4 w-4" aria-hidden />}{guide.sample}
                </Button>
                {practised && <p className="text-sm text-paper" role="status">{guide.result}</p>}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </Modal>
  );
}
