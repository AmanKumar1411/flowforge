import { LinkType } from "./link-type";

/** Decides whether a URL is a proper link of one type (Strategy). */
export interface LinkValidator {
  readonly type: LinkType;
  /** For error messages: "a GitHub repository (https://github.com/owner/repo)". */
  readonly expected: string;
  accepts(url: URL): boolean;
}

const isHttps = (url: URL): boolean => url.protocol === "https:";

/** `https://github.com/<owner>/<repo>`, with anything after the repository. */
export class GithubLinkValidator implements LinkValidator {
  readonly type = "GITHUB";
  readonly expected = "a GitHub repository (https://github.com/owner/repo)";

  accepts(url: URL): boolean {
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return (
      isHttps(url) &&
      url.hostname === "github.com" &&
      Boolean(owner) &&
      Boolean(repo)
    );
  }
}

/** A Google Drive file or folder, or a Google Docs, Sheets or Slides document. */
export class DriveLinkValidator implements LinkValidator {
  readonly type = "DRIVE";
  readonly expected =
    "a Google Drive or Docs link (https://drive.google.com/… or https://docs.google.com/…)";

  accepts(url: URL): boolean {
    return (
      isHttps(url) &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname) &&
      url.pathname.length > 1
    );
  }
}

/** Any https page: a deployed demo, a report hosted anywhere. */
export class HttpsLinkValidator implements LinkValidator {
  readonly expected = "an https link";

  constructor(readonly type: LinkType) {}

  accepts(url: URL): boolean {
    return isHttps(url) && url.hostname.includes(".");
  }
}

/**
 * The validators by link type (Open/Closed: a new type is one class and one
 * `register` call, nothing else changes). Pure; one shared instance.
 */
export class LinkValidatorRegistry {
  private readonly validators = new Map<LinkType, LinkValidator>();

  register(validator: LinkValidator): this {
    this.validators.set(validator.type, validator);
    return this;
  }

  for(type: LinkType): LinkValidator {
    const validator = this.validators.get(type);
    if (!validator) throw new Error(`No link validator for ${type}`);
    return validator;
  }

  static withDefaults(): LinkValidatorRegistry {
    return new LinkValidatorRegistry()
      .register(new GithubLinkValidator())
      .register(new DriveLinkValidator())
      .register(new HttpsLinkValidator("DEMO"))
      .register(new HttpsLinkValidator("REPORT"));
  }
}

export const linkValidators = LinkValidatorRegistry.withDefaults();
