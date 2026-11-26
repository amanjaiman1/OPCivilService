import { Card, Page } from "../../src/ui";
import { OpenModule, type Destination } from "../../src/navigation";

const groups: { title: string; modules: Destination[] }[] = [
  { title: "Study records", modules: ["journal", "subjects", "revision", "goals", "habits", "books", "current-affairs"] },
  { title: "Reflection and analysis", modules: ["diary", "mistakes", "mocks", "coach", "performance-review", "knowledge-graph", "heatmap"] },
  { title: "DoOrDie", modules: ["announcements", "notices", "settings", "feedback", "tour"] },
];

export default function More() {
  return <Page title="More">{groups.map(({ title, modules }) => <Card key={title} title={title}>{modules.map((name) => <OpenModule key={name} name={name} />)}</Card>)}</Page>;
}
