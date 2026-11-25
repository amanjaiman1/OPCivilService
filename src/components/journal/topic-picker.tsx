"use client";

import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { BookMarked, History, Plus, Search, X } from "lucide-react";
import type { JournalEntry, Subject, TopicCompletion } from "@/lib/types";
import { completionKey, normName, searchTopicOptions, type TopicOption } from "@/lib/topics";
import { Select } from "@/components/ui/form";
import { STATUS_LABEL } from "@/lib/subjects";
import { cn, formatDate, uid } from "@/lib/utils";

const STATUS_DOT: Record<string, string> = {
  untouched: "bg-paper/25",
  learning: "bg-accent/45",
  revised: "bg-accent/75",
  mastered: "bg-accent",
};

/** Search the selected subject before adding a new topic or an unassigned note. */
export function TopicPicker({
  value,
  onChange,
  subjects,
  journal,
  prefer,
}: {
  value: TopicCompletion[];
  onChange: (next: TopicCompletion[]) => void;
  subjects: Subject[];
  journal: JournalEntry[];
  /** Subjects studied in this entry, whose topics are suggested first. */
  prefer?: string[];
}) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);
  const chosen = useMemo(() => new Set(value.map(completionKey)), [value]);
  const preferSet = useMemo(() => new Set((prefer ?? []).filter((id) => subjectName.has(id))), [prefer, subjectName]);
  const suggested = preferSet.size === 1 ? [...preferSet][0] : "";
  const subjectId = selection !== null && subjectName.has(selection) ? selection : selection === "" ? "" : suggested;

  const options = useMemo(
    () => searchTopicOptions(deferred, subjects, journal, {
      subjectId: subjectId || undefined,
      exclude: new Set([...chosen].flatMap((key) => [key, `custom:${key}`])),
      limit: 12,
      prefer: subjectId ? undefined : preferSet,
    }),
    [deferred, subjects, journal, chosen, preferSet, subjectId],
  );
  const typed = query.trim().replace(/\s+/g, " ");
  const exact = subjects.find((subject) => subject.id === subjectId)?.topics.filter((topic) => normName(topic.name) === normName(typed)) ?? [];
  const showCustom = Boolean(typed && typed.length <= 160 && !exact.length && !chosen.has(completionKey({ id: "", name: typed, subjectId })));
  const total = options.length + Number(showCustom);

  function pick(o: TopicOption) {
    onChange([
      ...value,
      { id: uid("tc"), name: o.name, ...(o.subjectId ? { subjectId: o.subjectId } : {}), ...(o.topicId ? { topicId: o.topicId } : {}) },
    ]);
    setQuery("");
    setActive(-1);
    inputRef.current?.focus();
  }
  function addCustom() {
    if (!typed) return;
    onChange([...value, { id: uid("tc"), name: typed, ...(subjectId ? { subjectId } : {}) }]);
    setQuery("");
    setActive(-1);
  }

  return (
    <div className="space-y-2.5">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Topics completed">
          {value.map((c) => (
            <li
              key={c.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-paper/[0.04] py-1 pl-2.5 pr-1 text-xs font-medium text-paper/85"
            >
              {c.topicId ? (
                <BookMarked className="h-3 w-3 shrink-0 text-accent" aria-label="From the syllabus" />
              ) : (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-paper/35" aria-hidden />
              )}
              <span className="truncate">{c.name}</span>
              {c.subjectId && !c.topicId && <span className="shrink-0 text-accent">New</span>}
              {c.subjectId && (
                <span className="hidden shrink-0 text-paper/45 sm:inline">· {subjectName.get(c.subjectId) ?? ""}</span>
              )}
              <button
                type="button"
                onClick={() => onChange(value.filter((x) => x.id !== c.id))}
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-paper/45 hover:bg-paper/10 hover:text-paper"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="block space-y-1 text-xs text-paper/65">
        <span>Topic subject</span>
        <Select value={subjectId} onChange={(event) => { setSelection(event.target.value); setActive(-1); }}>
          <option value="">All subjects · new topics stay unassigned</option>
          {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
        </Select>
      </label>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-paper/35" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(-1);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.max(0, Math.min(total - 1, a + 1)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (!open || deferred !== query) return;
              if (options[active]) pick(options[active]);
              else if (showCustom && (active < 0 || active === options.length)) addCustom();
              else if (exact.length === 1) {
                const matched = options.find((option) => option.topicId === exact[0].id);
                if (matched) pick(matched);
              }
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          role="combobox"
          aria-expanded={open && total > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search or enter a topic"
          aria-activedescendant={open && active >= 0 && active < total ? `${listId}-${active}` : undefined}
          placeholder="Search the syllabus or type a topic…"
          className="field w-full rounded-xl border border-line bg-paper/[0.03] py-2.5 pl-10 pr-3.5 text-sm text-paper placeholder:text-paper/40 transition-all focus:border-accent/60 focus:bg-card focus:outline-none focus:ring-4 focus:ring-accent/10"
        />
      </div>

      {open && exact.length > 1 && (
        <p className="text-xs text-warning" role="status">Several syllabus topics have this name. Choose the intended topic.</p>
      )}
      {open && typed.length > 160 && (
        <p className="text-xs text-warning" role="status">Keep a new topic name to 160 characters.</p>
      )}
      {open && total > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="max-h-64 overflow-y-auto rounded-xl border border-line bg-card p-1 shadow-lift"
        >
          {!typed && (
            <li className="px-2.5 pb-1 pt-1.5 text-[0.72rem] font-semibold text-paper/45" aria-hidden>
              {preferSet.size ? "From the subjects you studied" : "Recently finished"}
            </li>
          )}
          {options.map((o, i) => (
            <li key={o.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
                  i === active ? "bg-accent/[0.1]" : "hover:bg-paper/[0.05]",
                )}
              >
                {o.source === "syllabus" ? (
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT[o.status ?? "untouched"])} title={STATUS_LABEL[o.status ?? "untouched"]} />
                ) : (
                  <History className="h-3.5 w-3.5 shrink-0 text-paper/45" aria-label="Saved earlier" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-paper">{o.name}</span>
                  <span className="block truncate text-[0.68rem] text-paper/50">
                    {[
                      o.subjectName,
                      o.source === "saved" ? "saved earlier" : o.status ? STATUS_LABEL[o.status] : null,
                      o.timesDone ? `done ${o.timesDone}×${o.lastDone ? `, last ${formatDate(o.lastDone)}` : ""}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {showCustom && (
            <li id={`${listId}-${options.length}`} role="option" aria-selected={active === options.length}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={addCustom}
                onMouseEnter={() => setActive(options.length)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm",
                  active === options.length ? "bg-accent/[0.1]" : "hover:bg-paper/[0.05]",
                )}
              >
                <Plus className="h-3.5 w-3.5 shrink-0 text-accent" />
                <span className="min-w-0 truncate">
                  Add “<span className="font-medium text-paper">{typed}</span>” {subjectId ? `under ${subjectName.get(subjectId)}` : "without a subject"}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
