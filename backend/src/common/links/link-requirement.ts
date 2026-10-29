import { isLinkType, Link, LinkType, LINK_TYPES } from "./link-type";
import { LinkDomainError } from "./link.errors";
import { LinkValidatorRegistry, linkValidators } from "./link-validators";

const LABELS: Record<LinkType, string> = {
  GITHUB: "GitHub",
  DRIVE: "Drive",
  DEMO: "demo",
  REPORT: "report",
};

/** What a link requirement looks like when stored (JSON) or sent. */
export interface LinkRequirementShape {
  required: LinkType[];
  optional: LinkType[];
}

/**
 * Which links a faculty member asks for: some required, some optional, the
 * rest not allowed. A value object: checked when built, never changed, and
 * compared by value. The shape is checked here, not only in DTOs, because it
 * is also read back from JSON columns.
 */
export class LinkRequirement {
  private constructor(
    readonly required: readonly LinkType[],
    readonly optional: readonly LinkType[],
  ) {}

  /** For an idea: nothing required, a GitHub or Drive link welcome. */
  static readonly IDEA_DEFAULT = new LinkRequirement([], ["GITHUB", "DRIVE"]);
  /** For a milestone: the repository, plus a demo or a report if the team has one. */
  static readonly MILESTONE_DEFAULT = new LinkRequirement(
    ["GITHUB"],
    ["DEMO", "REPORT"],
  );

  /** Throws INVALID_LINK_REQUIREMENT for anything but `{required: LinkType[], optional: LinkType[]}` without overlap. */
  static from(raw: unknown): LinkRequirement {
    const invalid = (message: string) =>
      new LinkDomainError("INVALID_LINK_REQUIREMENT", message);
    if (typeof raw !== "object" || raw === null) {
      throw invalid("A link requirement lists required and optional links");
    }
    const { required, optional } = raw as Record<string, unknown>;
    const list = (value: unknown, name: string): LinkType[] => {
      if (!Array.isArray(value) || !value.every(isLinkType)) {
        throw invalid(
          `${name} links must be a list of ${LINK_TYPES.join(", ")}`,
        );
      }
      if (new Set(value).size !== value.length) {
        throw invalid(`${name} links list a type twice`);
      }
      return value;
    };
    const requiredTypes = list(required, "Required");
    const optionalTypes = list(optional, "Optional");
    const both = requiredTypes.find((type) => optionalTypes.includes(type));
    if (both) {
      throw invalid(`The ${LABELS[both]} link cannot be required and optional`);
    }
    // Stored in a fixed order, so equal requirements compare equal.
    const ordered = (types: LinkType[]) =>
      LINK_TYPES.filter((type) => types.includes(type));
    return new LinkRequirement(ordered(requiredTypes), ordered(optionalTypes));
  }

  allows(type: LinkType): boolean {
    return this.required.includes(type) || this.optional.includes(type);
  }

  equals(other: LinkRequirement): boolean {
    return JSON.stringify(this.toJSON()) === JSON.stringify(other.toJSON());
  }

  toJSON(): LinkRequirementShape {
    return { required: [...this.required], optional: [...this.optional] };
  }

  /**
   * The links a team sends, trimmed and checked against this requirement:
   * each type at most once (INVALID_LINK), only allowed types
   * (LINK_NOT_ALLOWED), each URL valid for its type (INVALID_LINK), every
   * required type present (MISSING_REQUIRED_LINK). An empty URL means none.
   */
  check(
    links: readonly { type: string; url: string }[],
    validators: LinkValidatorRegistry = linkValidators,
  ): Link[] {
    const given = links
      .map((link) => ({ type: link.type, url: link.url.trim() }))
      .filter((link) => link.url !== "");
    const seen = new Set<string>();
    for (const link of given) {
      if (seen.has(link.type)) {
        throw new LinkDomainError(
          "INVALID_LINK",
          `Give one ${isLinkType(link.type) ? LABELS[link.type] : link.type} link, not several`,
        );
      }
      seen.add(link.type);
    }
    const checked: Link[] = [];
    for (const link of given) {
      if (!isLinkType(link.type) || !this.allows(link.type)) {
        throw new LinkDomainError(
          "LINK_NOT_ALLOWED",
          `A ${isLinkType(link.type) ? LABELS[link.type] : link.type} link is not asked for here`,
        );
      }
      const validator = validators.for(link.type);
      if (!validator.accepts(parse(link.url))) {
        throw new LinkDomainError(
          "INVALID_LINK",
          `The ${LABELS[link.type]} link must be ${validator.expected}`,
        );
      }
      checked.push({ type: link.type, url: link.url });
    }
    const missing = this.required.filter((type) => !seen.has(type));
    if (missing.length > 0) {
      throw new LinkDomainError(
        "MISSING_REQUIRED_LINK",
        `Add the ${missing.map((type) => LABELS[type]).join(" and ")} link`,
      );
    }
    // Same order as the requirement lists them, so versions read alike.
    return LINK_TYPES.flatMap((type) =>
      checked.filter((link) => link.type === type),
    );
  }
}

/** A URL that cannot be parsed never passes a validator. */
function parse(value: string): URL {
  try {
    return new URL(value);
  } catch {
    return new URL("invalid:");
  }
}
