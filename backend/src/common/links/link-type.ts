/** The kinds of link a faculty member can ask for. Adding one: a name here, a validator in link-validators.ts. */
export const LINK_TYPES = ["GITHUB", "DRIVE", "DEMO", "REPORT"] as const;

export type LinkType = (typeof LINK_TYPES)[number];

/** One link a team hands in with an idea or a milestone's work. */
export interface Link {
  type: LinkType;
  url: string;
}

export const isLinkType = (value: unknown): value is LinkType =>
  (LINK_TYPES as readonly unknown[]).includes(value);
