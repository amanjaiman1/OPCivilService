import { featureForPath, type FeatureKey } from "./features";

export interface EntryGuide {
  title: string;
  steps: readonly [string, string, string];
  sample: string;
  result: string;
}

export const captureGuide: EntryGuide = {
  title: "Record a day",
  steps: [
    "Pick the day. In Study, add a subject and the time you spent on it.",
    "Choose a completed topic or enter a new one. Check off any weekly work you finished.",
    "Open Life, Goals or Habits if you have something else to record, then choose Save All Changes.",
  ],
  sample: "Finish a sample topic",
  result: "A subject-linked topic updates Subject Progress and joins the revision queue when scheduling is enabled.",
};

const guides: Partial<Record<FeatureKey, EntryGuide>> = {
  dashboard: captureGuide,
  journal: captureGuide,
  subjects: {
    title: "Update subject progress",
    steps: ["Choose New subject and enter its name and paper.", "Open the subject and use Add a topic to build your syllabus.", "Set a topic's status or confidence as you study it."],
    sample: "Mark a sample topic as learning",
    result: "The subject's learning total includes the topic. Add it to Revision when you want a scheduled review.",
  },
  revision: {
    title: "Log a revision",
    steps: ["Use Add item for a topic that isn't already queued.", "Open the due topic. Choose Recalled or Forgot based on what you could remember.", "Check its next due date before moving to the next topic."],
    sample: "Recall a sample topic",
    result: "A recorded pass updates the schedule and counts toward a connected revision habit.",
  },
  goals: {
    title: "Create and update a goal",
    steps: ["Choose New goal, or Add goal in a category to start there.", "Set what you want to achieve and how to measure progress.", "Open a goal to add a manual reading, milestone or note when relevant."],
    sample: "Record sample goal progress",
    result: "The goal shows its progress against the target. Automatic goals read from the selected source.",
  },
  roadmap: {
    title: "Plan and complete weekly work",
    steps: ["Choose Create a plan and select a week.", "Add objectives, activities or milestones. Link a goal if it helps.", "Check off the original item here or under Your weekly targets in Daily Capture."],
    sample: "Complete a sample objective",
    result: "The weekly plan and its review show the completed objective.",
  },
  habits: {
    title: "Set up and check in on a habit",
    steps: ["Choose Create a habit and name the behavior.", "Pick the schedule and whether to check in manually or connect activity.", "Check in on My Habits or in Daily Capture when the habit is due."],
    sample: "Check in on a sample habit",
    result: "The habit shows the completed day. Connected habits can fill in from recorded activity.",
  },
  life: {
    title: "Log a Life reading",
    steps: ["Choose Log today or Edit today, or open Life in Daily Capture.", "Enter only the readings you have. Choose which fields to track if a metric is missing.", "Save the day. Leave a field blank when you have no reading."],
    sample: "Enter a sample water reading",
    result: "The reading appears for that day and can count toward a connected habit.",
  },
  mocks: {
    title: "Record a mock test",
    steps: ["Choose Log mock.", "Enter the test, date and score. Add section detail if you have it.", "Save and open the attempt to check its breakdown."],
    sample: "Log a sample mock",
    result: "The attempt appears in your history and contributes to score trends.",
  },
  currentAffairs: {
    title: "Capture a current affairs note",
    steps: ["Choose Add note.", "Give it a title and record the key point. Add source and tags when useful.", "Save and use search or filters to find it later."],
    sample: "Save a sample note",
    result: "The title and tags help you find the note when revising.",
  },
  library: {
    title: "Add a book and track reading",
    steps: ["Choose Add book and enter its title.", "Fill in the subject or reading details you know.", "Open the saved book to update its progress."],
    sample: "Add a sample book",
    result: "The book appears in your library, ready for progress updates.",
  },
  mistakes: {
    title: "Record and correct a mistake",
    steps: ["Choose Log mistake.", "Enter the topic or question, then note what went wrong.", "Review the mistake later and update its status when you can answer it."],
    sample: "Log a sample mistake",
    result: "The mistake stays available for review and can be found by topic.",
  },
  knowledgeGraph: {
    title: "Connect topics",
    steps: ["Select a topic node in the graph.", "Open its details and choose the topic to connect it with.", "Use Create link to save the relationship between the two topics."],
    sample: "Link two sample topics",
    result: "The graph shows the relationship between the topics.",
  },
  diary: {
    title: "Write a diary entry",
    steps: ["Choose New entry and check its date.", "Write what you want to remember in the editor.", "Save the entry and find it again in the diary list."],
    sample: "Save a sample diary entry",
    result: "The note belongs to your Personal Diary. It does not count as study or contribute to a habit.",
  },
  performanceReview: {
    title: "Write a performance review",
    steps: ["Choose a period and open its review.", "Read the figures gathered from your records, then add your reflection.", "Save a draft to finish later or complete the review."],
    sample: "Save a sample review draft",
    result: "The draft keeps your reflection attached to its period.",
  },
  coach: {
    title: "Act on a Study Coach suggestion",
    steps: ["Open a suggestion in your briefing.", "Check the evidence and read the proposed action.", "Apply it when you agree, or use the available controls to defer or dismiss it."],
    sample: "Review a sample suggestion",
    result: "A suggestion updates related work only after you choose to apply it.",
  },
};

export function entryGuideForPath(pathname: string): EntryGuide | undefined {
  const feature = featureForPath(pathname);
  return feature ? guides[feature] : undefined;
}
