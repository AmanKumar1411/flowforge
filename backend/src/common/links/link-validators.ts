import { isIP } from "node:net";
import { LinkType } from "./link-type";

/** Decides whether a URL is a proper link of one type (Strategy). */
export interface LinkValidator {
  readonly type: LinkType;
  /** For error messages: "a GitHub repository (https://github.com/owner/repo)". */
  readonly expected: string;
  accepts(url: URL): boolean;
}

// Names that only mean something on one machine or one network.
const LOCAL_NAMES =
  /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/i;

/**
 * A link anyone can open: https, a public host name (never an IP address,
 * localhost or a .local/.internal name), and no username or password in it
 * (SEC-F4, H13). The API never fetches links; this keeps intranet addresses
 * and tokens out of what students and faculty click.
 */
export function isPublicHttpsLink(url: URL): boolean {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    isIP(host) === 0 &&
    host.includes(".") &&
    !LOCAL_NAMES.test(host)
  );
}

/** `https://github.com/<owner>/<repo>`, with anything after the repository. */
export class GithubLinkValidator implements LinkValidator {
  readonly type = "GITHUB";
  readonly expected = "a GitHub repository (https://github.com/owner/repo)";

  accepts(url: URL): boolean {
    const [owner, repo] = url.pathname.split("/").filter(Boolean);
    return (
      isPublicHttpsLink(url) &&
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
      isPublicHttpsLink(url) &&
      ["drive.google.com", "docs.google.com"].includes(url.hostname) &&
      url.pathname.length > 1
    );
  }
}

/** Any public https page: a deployed demo, a report hosted anywhere. */
export class HttpsLinkValidator implements LinkValidator {
  readonly expected =
    "a public https link (a site name, not an IP address, and no password in it)";

  constructor(readonly type: LinkType) {}

  accepts(url: URL): boolean {
    return isPublicHttpsLink(url);
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
