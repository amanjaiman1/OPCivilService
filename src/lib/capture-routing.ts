import { CAPTURE_SECTIONS, parseCaptureDate, parseSection, type CaptureSection } from "./daily-capture";
import type { ISODate } from "./types";

export interface CaptureTarget {
  date?: ISODate;
  section?: CaptureSection;
}

export function captureLink(pathname: string, params: URLSearchParams, today: ISODate): CaptureTarget | null {
  if (pathname !== "/journal") return null;
  const tab = params.get("tab");
  const explicit = params.get("new") === "1";
  if (!explicit && (tab === "topics" || tab === "analysis")) return null;
  const section = parseSection(params.get("section"));
  const hasSection = CAPTURE_SECTIONS.some((item) => item === params.get("section"));
  const date = parseCaptureDate(params.get("date"), today);
  if (!explicit && !hasSection && !params.has("date")) return null;
  return { date, section };
}

export function withoutCaptureParams(url: URL): string {
  for (const key of ["new", "date", "section"]) url.searchParams.delete(key);
  return url.pathname + url.search + url.hash;
}
