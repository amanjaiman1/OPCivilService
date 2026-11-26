"use client";

import { useId, type CSSProperties } from "react";
import type { JournalEntry } from "@/lib/types";
import { ENERGY_LABELS, FOCUS_LABELS, MOOD_LABELS, MOTIVATION_LABELS } from "./constants";
import styles from "./feeling-sliders.module.css";

const SCALES = [
  { field: "mood", label: "Mood", labels: MOOD_LABELS, emojis: ["😞", "🙁", "😐", "🙂", "😄"] },
  { field: "energy", label: "Energy", labels: ENERGY_LABELS, emojis: ["🪫", "😴", "😌", "⚡", "🔋"] },
  { field: "motivation", label: "Motivation", labels: MOTIVATION_LABELS, emojis: ["😔", "😕", "🙂", "💪", "🔥"] },
  { field: "focus", label: "Focus", labels: FOCUS_LABELS, emojis: ["😵‍💫", "🌫️", "😌", "🎯", "🧠"] },
] as const;

type FeelingValues = Pick<JournalEntry, (typeof SCALES)[number]["field"]>;
const LEVELS = [1, 2, 3, 4, 5];

function FeelingSlider({ scale, value, onChange }: {
  scale: (typeof SCALES)[number];
  value: number;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const level = Number.isFinite(value) ? Math.min(5, Math.max(1, Math.round(value))) : 3;
  const description = scale.labels[level];

  return (
    <div className={styles.rating}>
      <label htmlFor={id} className={styles.heading}>{scale.label}</label>
      <div className={styles.control} style={{ "--feeling-position": `${(level - 1) * 25}%` } as CSSProperties}>
        <div className={styles.rail} aria-hidden="true">
          <div className={styles.travel}>
            <div className={styles.fill} />
          </div>
          <span className={styles.status} data-side={level <= 3 ? "end" : "start"}>{description}</span>
        </div>
        <div className={styles.travel} aria-hidden="true">
          <span className={styles.lens}>
            <span key={level} className={styles.emoji}>{scale.emojis[level - 1]}</span>
          </span>
          <div className={styles.stops}>
            {LEVELS.map((stop) => (
              <span key={stop} data-selected={stop === level}>{stop}</span>
            ))}
          </div>
        </div>
        <input
          type="range"
          id={id}
          min={1}
          max={5}
          step={1}
          value={level}
          aria-valuetext={`${level} of 5, ${description}`}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
          className={styles.input}
        />
      </div>
    </div>
  );
}

export function FeelingSliders({ values, onChange }: {
  values: FeelingValues;
  onChange: (patch: Partial<FeelingValues>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
      {SCALES.map((scale) => (
        <FeelingSlider
          key={scale.field}
          scale={scale}
          value={values[scale.field]}
          onChange={(value) => onChange({ [scale.field]: value })}
        />
      ))}
    </div>
  );
}
