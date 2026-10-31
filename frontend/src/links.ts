import type { Link, LinkRequirement, LinkType } from "./types";

/**
 * Link requirements in words, and the API's link checks mirrored for display
 * only (common/links on the backend decides). Change both sides together.
 */

export const LINK_TYPES: readonly LinkType[] = ["GITHUB", "DRIVE", "DEMO", "REPORT"];

export const LINK_LABELS: Record<LinkType, string> = {
  GITHUB: "GitHub repository",
  DRIVE: "Google Drive or Docs",
  DEMO: "Demo",
  REPORT: "Report",
};

export const LINK_PLACEHOLDERS: Record<LinkType, string> = {
  GITHUB: "https://github.com/owner/repo",
  DRIVE: "https://drive.google.com/…",
  DEMO: "https://…",
  REPORT: "https://…",
};

/** The types a team may hand in, required ones first. */
export function allowedTypes(requirement: LinkRequirement): LinkType[] {
  return [
    ...LINK_TYPES.filter((type) => requirement.required.includes(type)),
    ...LINK_TYPES.filter((type) => requirement.optional.includes(type)),
  ];
}

/** "GitHub repository required · Demo, Report optional", or "No links". */
export function requirementText(requirement: LinkRequirement): string {
  const names = (types: LinkType[]) => types.map((type) => LINK_LABELS[type]).join(", ");
  const parts = [
    requirement.required.length ? `${names(requirement.required)} required` : "",
    requirement.optional.length ? `${names(requirement.optional)} optional` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No links";
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

// Same rule as the API's isPublicHttpsLink (H13): a site name, not an IP address or a local name.
const LOCAL_NAMES = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i;
const IP_ADDRESS = /^(\d{1,3}(\.\d{1,3}){3}|\[[0-9a-f:.]+\])$/i;

/** Why a URL is not a proper link of its type, or null. */
export function linkProblem(type: LinkType, raw: string): string | null {
  const url = parse(raw.trim());
  if (!url || url.protocol !== "https:") return "Paste a full link that starts with https://";
  if (url.username || url.password) return "Remove the username or password from the link";
  if (IP_ADDRESS.test(url.hostname) || LOCAL_NAMES.test(url.hostname)) {
    return "Use the site's public address, not an IP address or a local name";
  }
  if (type === "GITHUB") {
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    if (url.hostname !== "github.com" || !owner || !repo) {
      return "Paste the repository's link: https://github.com/owner/repo";
    }
  }
  if (type === "DRIVE") {
    if (!["drive.google.com", "docs.google.com"].includes(url.hostname) || url.pathname.length <= 1) {
      return "Paste a Google Drive or Docs link";
    }
  }
  if (!url.hostname.includes(".")) return "Paste a full link that starts with https://";
  return null;
}

export type LinkValues = Partial<Record<LinkType, string>>;

/** The links typed in, without the empty ones. */
export function linksFrom(requirement: LinkRequirement, values: LinkValues): Link[] {
  return allowedTypes(requirement).flatMap((type) => {
    const url = values[type]?.trim() ?? "";
    return url ? [{ type, url }] : [];
  });
}

/** What is wrong with the links typed in, per type: a missing required one or a bad URL. */
export function linkProblems(requirement: LinkRequirement, values: LinkValues): LinkValues {
  const problems: LinkValues = {};
  for (const type of allowedTypes(requirement)) {
    const url = values[type]?.trim() ?? "";
    if (!url) {
      if (requirement.required.includes(type)) problems[type] = `Add the ${LINK_LABELS[type]} link.`;
      continue;
    }
    const problem = linkProblem(type, url);
    if (problem) problems[type] = problem;
  }
  return problems;
}

/** Links as form values, for editing. */
export function valuesOf(links: readonly Link[]): LinkValues {
  return Object.fromEntries(links.map((link) => [link.type, link.url]));
}
