import { useRouter } from "expo-router";
import { Action } from "./ui";
import { useSession } from "./session";

export const destinations = {
  journal: "Daily Journal",
  subjects: "Subject Progress",
  revision: "Revision",
  goals: "Goals",
  habits: "Habits",
  diary: "Personal Diary",
  books: "Library",
  mocks: "Mock Analytics",
  mistakes: "Mistake Tracker",
  "current-affairs": "Current Affairs",
  coach: "Study Coach",
  "performance-review": "Performance Review",
  "knowledge-graph": "Knowledge Graph",
  heatmap: "Study Heatmap",
  announcements: "Announcements",
  settings: "Settings",
  feedback: "Help & feedback",
  notices: "Notifications",
  review: "Review DoOrDie",
  tour: "Quick tour",
} as const;

export type Destination = keyof typeof destinations;

export function OpenModule({ name }: { name: Destination }) {
  const router = useRouter();
  const { attention } = useSession();
  const updates = name === "announcements" ? attention?.announcements : name === "feedback" ? attention?.feedback : 0;
  const label = updates ? `${destinations[name]} · ${updates} new` : destinations[name];
  return <Action label={label} onPress={() => router.push({ pathname: "/module/[name]", params: { name } })} />;
}
