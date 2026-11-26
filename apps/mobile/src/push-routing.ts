const destinations = {
  "/revision": "revision",
  "/mistakes": "mistakes",
  "/habits": "habits",
  "/goals": "goals",
  "/mocks": "mocks",
  "/subjects": "subjects",
  "/books": "books",
  "/current-affairs": "current-affairs",
  "/performance-review": "performance-review",
  "/diary": "diary",
  "/announcements": "announcements",
  "/feedback": "feedback",
} as const;

export function noticeRoute(path: unknown) {
  if (typeof path !== "string") return null;
  const route = path.split("?")[0];
  if (route === "/dashboard") return { pathname: "/" } as const;
  if (route === "/journal") return { pathname: "/capture" } as const;
  if (route === "/roadmap") return { pathname: "/plan" } as const;
  if (route === "/wellbeing") return { pathname: "/life" } as const;
  if (Object.hasOwn(destinations, route)) {
    return { pathname: "/module/[name]", params: { name: destinations[route as keyof typeof destinations] } } as const;
  }
  return null;
}

export function notificationRoute(data: Record<string, unknown>, device: string, action: string) {
  if (data.device !== device || action === "later") return null;
  if (action === "sleep-now") {
    return data.bedtime === true && data.route === "/wellbeing"
      ? { pathname: "/life", params: { bedtime: "confirm" } } as const
      : null;
  }
  return action === "expo.modules.notifications.actions.DEFAULT" ? noticeRoute(data.route) : null;
}
