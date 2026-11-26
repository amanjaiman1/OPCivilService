import { Stack, useLocalSearchParams } from "expo-router";
import { Gate } from "../../src/gate";
import { Journal, Subjects, Revision, Goals, Habits } from "../../src/study";
import { Affairs, Diary, Library, Mistakes, Mocks } from "../../src/records";
import { Coach, Graph, Heatmap, Performance } from "../../src/analysis";
import { Announcements, Feedback, Notices, ProductReview, Settings } from "../../src/services";
import { destinations, type Destination } from "../../src/navigation";
import { Page } from "../../src/ui";
import { Tour } from "../../src/tour";

const screens = {
  journal: Journal, subjects: Subjects, revision: Revision, goals: Goals, habits: Habits, diary: Diary,
  books: Library, mocks: Mocks, mistakes: Mistakes, "current-affairs": Affairs, coach: Coach,
  "performance-review": Performance, "knowledge-graph": Graph, heatmap: Heatmap, announcements: Announcements,
  settings: Settings, feedback: Feedback, notices: Notices, review: ProductReview, tour: Tour,
} satisfies Record<Destination, React.ComponentType>;

export default function Module() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  if (typeof name !== "string" || !Object.hasOwn(screens, name)) return <Page title="This page is unavailable" />;
  const key = name as Destination;
  const Screen = screens[key];
  return <Gate><Stack.Screen options={{ title: destinations[key] }} /><Screen /></Gate>;
}
