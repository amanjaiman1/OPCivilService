import { useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useAccount, useChronicle } from "./session";
import { Action, Card, Copy, Field, Page, Row, usePalette } from "./ui";
import { buildRecommendations, visibleRecommendations } from "../../../src/lib/coach";
import { buildGraph, graphDensity, relatedSuggestions, topicLinksFor } from "../../../src/lib/graph";
import { answersOf, figuresFor, findReview, measurePeriod, recentPeriods, REVIEW_QUESTIONS, type ReviewPeriod } from "../../../src/lib/performance";
import { noticeRoute } from "./push-routing";
import { formatHours, fromISODate, toISODate, uid } from "../../../src/lib/utils";

export function Coach() {
  const router = useRouter();
  const { store } = useAccount();
  const state = useChronicle((s) => s);
  const today = toISODate(new Date());
  const { shown } = useMemo(() => visibleRecommendations(buildRecommendations(state, today), state.coach), [state, today]);
  return <Page title="Study Coach" intro="Suggestions based on your preparation records.">
    {shown.slice(0, 12).map((item) => {
      const route = noticeRoute(item.action.href);
      const decide = (status: "accepted" | "dismissed" | "done") =>
        store.getState().recordCoachDecision({ recId: item.id, title: item.title, fingerprint: item.fingerprint, status });
      return <Card key={item.id} title={item.title}><Copy>{item.why}</Copy>
        {route && <Action label={item.action.label} onPress={() => { decide("accepted"); router.push(route); }} />}
        <Row><Action label="Mark done" onPress={() => decide("done")} /><Action label="Dismiss" onPress={() => decide("dismissed")} /></Row>
      </Card>;
    })}
    {!shown.length && <Copy muted>No recommendations for the records available today.</Copy>}
  </Page>;
}

function ReviewEditor({ period, today }: { period: ReviewPeriod; today: string }) {
  const { store } = useAccount();
  const state = useChronicle((s) => s);
  const existing = findReview(state.reviews, period);
  const [opened, setOpened] = useState(existing);
  const [answers, setAnswers] = useState(() => existing ? answersOf(existing) : {});
  const [message, setMessage] = useState("");
  const figures = existing ? figuresFor(existing, state, today).snapshot : measurePeriod(state, period, today);

  function save(completed: boolean) {
    const current = store.getState();
    const latest = findReview(current.reviews, period);
    if (latest !== opened) { setMessage("This review changed. Reopen the period before saving."); return; }
    const finalized = completed || (latest && latest.status !== "draft");
    const snapshot = completed ? latest?.snapshot ?? measurePeriod(current, period, today) : latest?.snapshot;
    const id = latest?.id ?? uid("review");
    try {
      current.upsertReview({
        ...latest, id, type: period.type, periodLabel: period.label, startDate: period.startDate, endDate: period.endDate, answers,
        status: finalized ? "completed" : "draft", snapshot,
        completedAt: finalized ? latest?.completedAt ?? new Date().toISOString() : undefined,
      });
      setOpened(store.getState().reviews.find((item) => item.id === id));
      setMessage(completed ? "Review completed." : "Review saved.");
    } catch { setMessage("The review could not be saved."); }
  }
  return <Card title={period.label}>
    <Copy>{figures.daysLogged} days logged · {formatHours(figures.studyHours)} studied</Copy>
    <Copy>{figures.topicsCompleted} topics · {figures.revision.passes} revision passes</Copy>
    {REVIEW_QUESTIONS.map(({ key, label, placeholder }) => <Field key={key} label={label} placeholder={placeholder} multiline value={answers[key] ?? ""}
      onChangeText={(answer) => setAnswers({ ...answers, [key]: answer })} maxLength={4000} />)}
    {message && <Copy live>{message}</Copy>}
    <Row><Action label={existing && existing.status !== "draft" ? "Save changes" : "Save draft"} onPress={() => save(false)} />
      <Action label="Finish review" primary disabled={!Object.values(answers).some((value) => value.trim())}
        onPress={() => save(true)} /></Row>
  </Card>;
}

export function Performance() {
  const today = toISODate(new Date());
  const [kind, setKind] = useState<"Weekly" | "Monthly" | "Yearly">("Weekly");
  const [selected, setSelected] = useState(0);
  const periods = recentPeriods(kind, today);
  const period = periods[selected] ?? periods[0];
  return <Page title="Performance Review">
    <Row>{(["Weekly", "Monthly", "Yearly"] as const).map((option) => <Action key={option} label={option} selected={option === kind}
      primary={option === kind} onPress={() => { setKind(option); setSelected(0); }} />)}</Row>
    <Row>{periods.map((item, index) => <Action key={item.key} label={item.label} selected={selected === index}
      primary={selected === index} onPress={() => setSelected(index)} />)}</Row>
    {period && <ReviewEditor key={period.key} period={period} today={today} />}
  </Page>;
}

export function Graph() {
  const { store } = useAccount();
  const subjects = useChronicle((s) => s.subjects);
  const links = useChronicle((s) => s.topicLinks);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState("");
  const [relation, setRelation] = useState("");
  const graph = useMemo(() => buildGraph(subjects, links), [subjects, links]);
  const density = graphDensity(graph);
  const matches = query.trim() ? graph.nodes.filter((node) => node.type === "topic" && node.label.toLowerCase().includes(query.trim().toLowerCase())) : [];
  const selected = graph.nodes.find((item) => item.id === picked && item.type === "topic");
  const selectedLinks = selected ? topicLinksFor(graph, selected.id) : null;
  const connections = selectedLinks ? [...selectedLinks.outgoing, ...selectedLinks.incoming] : [];
  const linkedIds = new Set(connections.map((link) => link.source === picked ? link.target : link.source));
  return <Page title="Knowledge Graph" intro="Explore topics and their links.">
    <Card title="Topic connections"><Copy>{density.topics} topics · {density.topics - density.orphanCount} linked</Copy></Card>
    <Field label="Find a topic" value={query} onChangeText={setQuery} />
    {matches.slice(0, 10).map((item) => <Action key={item.id} label={item.label} primary={item.id === picked} selected={item.id === picked} onPress={() => setPicked(item.id)} />)}
    {selected && <Card title={selected.label}>
      {connections.map((link) => {
        const id = link.source === picked ? link.target : link.source;
        const topic = graph.nodes.find((node) => node.id === id);
        return <Row key={link.id}>
          <Action label={topic?.label ?? "Related topic"} onPress={() => setPicked(id)} />
          <Action label={`Remove link to ${topic?.label ?? "topic"}`} onPress={() => Alert.alert("Remove this link?", "Both topics stay in your subjects.", [
            { text: "Cancel", style: "cancel" },
            { text: "Remove link", style: "destructive", onPress: () => store.getState().removeTopicLink(link.id) },
          ])} />
          {link.relation && <Copy muted>{link.relation}</Copy>}
        </Row>;
      })}
      <Field label="Link description (optional)" value={relation} onChangeText={setRelation} maxLength={100} />
      {matches.filter((item) => item.id !== picked && !linkedIds.has(item.id)).slice(0, 5).map((item) =>
        <Action key={item.id} label={`Link to ${item.label}`} onPress={() => {
          store.getState().addTopicLink(picked, item.id, relation.trim() || undefined);
          setRelation("");
        }} />)}
      {relatedSuggestions(graph, picked).slice(0, 8).map((item) => <Action key={item.node.id} label={item.node.label} onPress={() => setPicked(item.node.id)} />)}
    </Card>}
  </Page>;
}

export function Heatmap() {
  const journal = useChronicle((s) => s.journal);
  const router = useRouter();
  const p = usePalette();
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const today = toISODate(now);
  const [selected, setSelected] = useState(today);
  const byDate = useMemo(() => new Map(journal.map((item) => [item.date, item.totalHours])), [journal]);
  const end = fromISODate(today);
  end.setDate(end.getDate() + (6 - (end.getDay() + 6) % 7) - offset * 28);
  const weeks = Array.from({ length: 4 }, (_, week) => Array.from({ length: 7 }, (_, day) => {
    const date = new Date(end);
    date.setDate(date.getDate() - 27 + week * 7 + day);
    return toISODate(date);
  }));
  const hours = byDate.get(selected);
  return <Page title="Study Heatmap" intro="Select a day to see its study time and open the journal.">
    <Card title="Four-week view">
      {[["M", "T", "W", "T", "F", "S", "S"]].concat(weeks).map((week, index) =>
        <View key={week[0]} style={{ flexDirection: "row", gap: 4 }}>
          {week.map((date, day) => {
            if (index === 0) return <Text key={day} style={{ flex: 1, color: p.quiet, textAlign: "center" }}>{date}</Text>;
            const duration = byDate.get(date);
            return <Pressable key={date} accessibilityRole="button" accessibilityState={{ selected: selected === date, disabled: date > today }}
              accessibilityLabel={`${date}, ${duration === undefined ? "no entry" : formatHours(duration)}`} disabled={date > today} onPress={() => setSelected(date)}
              style={{ minHeight: 46, flex: 1, justifyContent: "center", borderRadius: 7, borderWidth: selected === date ? 2 : 1,
                borderColor: selected === date ? p.ink : p.line, backgroundColor: duration ? p.accent : p.panel, opacity: date > today ? 0.4 : 1 }}>
              <Text style={{ color: duration ? p.accentInk : p.ink, textAlign: "center", fontWeight: duration ? "700" : "400" }}>{date.slice(-2)}</Text>
            </Pressable>;
          })}
        </View>)}
      <Copy>{selected} · {hours === undefined ? "No journal entry" : formatHours(hours)}</Copy>
      <Action label="Open this day" onPress={() => router.push({ pathname: "/capture", params: { date: selected } })} />
      <Row>
        <Action label="Earlier" disabled={offset >= 120} onPress={() => setOffset(offset + 1)} />
        <Action label="Later" disabled={offset === 0} onPress={() => setOffset(offset - 1)} />
      </Row>
    </Card>
  </Page>;
}
