"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./entry-edit-outline.module.css";

type SectionValues = Record<string, readonly unknown[]>;
const OUTLINE_MS = 1750;

/** Follow draft edits and ignore new sessions and hidden panels. */
export function useEntryEditOutline(sections: SectionValues, session: unknown, enabled = true) {
  const previous = useRef<{ sections: SectionValues; session: unknown; enabled: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const before = previous.current;
    previous.current = { sections, session, enabled };
    if (!enabled || !before?.enabled || !Object.is(before.session, session)) {
      clearTimeout(timer.current);
      setActive(null);
      return;
    }

    const changed = Object.keys(sections).find((key) => {
      const oldValues = before.sections[key];
      const newValues = sections[key];
      return oldValues && (oldValues.length !== newValues.length ||
        newValues.some((value, index) => !Object.is(value, oldValues[index])));
    });
    if (!changed) return;

    setActive(changed);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setActive(null), OUTLINE_MS);
  }, [sections, session, enabled]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (key: string, compact = false) => enabled && key === active
    ? compact ? `${styles.editing} ${styles.compact}` : styles.editing
    : undefined;
}
