import { LinkRequirement } from "./link-requirement";
import { LinkDomainError } from "./link.errors";
import {
  LinkValidatorRegistry,
  linkValidators,
  LinkValidator,
} from "./link-validators";

const codeOf = (work: () => unknown): string | undefined => {
  try {
    work();
  } catch (error) {
    if (error instanceof LinkDomainError) return error.code;
    throw error;
  }
  return undefined;
};

describe("link validators", () => {
  it.each([
    ["GITHUB", "https://github.com/falcon/lost-and-found", true],
    ["GITHUB", "https://github.com/falcon/lost-and-found/tree/main/src", true],
    ["GITHUB", "https://github.com/falcon", false],
    ["GITHUB", "https://github.com/", false],
    ["GITHUB", "http://github.com/falcon/app", false],
    ["GITHUB", "https://gitlab.com/falcon/app", false],
    ["DRIVE", "https://drive.google.com/drive/folders/abc", true],
    ["DRIVE", "https://docs.google.com/document/d/abc/edit", true],
    ["DRIVE", "https://drive.google.com/", false],
    ["DRIVE", "https://dropbox.com/s/abc", false],
    ["DEMO", "https://falcon.vercel.app", true],
    ["DEMO", "http://falcon.vercel.app", false],
    ["REPORT", "https://example.org/report.pdf", true],
    ["REPORT", "https://localhost/report", false],
  ] as const)("%s accepts %s: %s", (type, url, valid) => {
    expect(linkValidators.for(type).accepts(new URL(url))).toBe(valid);
  });

  it("takes another validator with one registration, leaving the others alone", () => {
    const figmaDemo: LinkValidator = {
      type: "DEMO",
      expected: "a Figma prototype",
      accepts: (url) => url.hostname === "www.figma.com",
    };
    const registry = LinkValidatorRegistry.withDefaults().register(figmaDemo);
    expect(
      registry.for("DEMO").accepts(new URL("https://www.figma.com/proto/x")),
    ).toBe(true);
    expect(
      registry.for("DEMO").accepts(new URL("https://falcon.vercel.app")),
    ).toBe(false);
    expect(
      registry.for("GITHUB").accepts(new URL("https://github.com/a/b")),
    ).toBe(true);
  });
});

describe("LinkRequirement", () => {
  const milestone = LinkRequirement.from({
    required: ["GITHUB"],
    optional: ["DEMO", "REPORT"],
  });

  it("keeps valid links, trimmed, in a fixed order, and drops empty ones", () => {
    expect(
      milestone.check([
        { type: "REPORT", url: " https://example.org/report.pdf " },
        { type: "GITHUB", url: "https://github.com/falcon/app" },
        { type: "DEMO", url: "" },
      ]),
    ).toEqual([
      { type: "GITHUB", url: "https://github.com/falcon/app" },
      { type: "REPORT", url: "https://example.org/report.pdf" },
    ]);
  });

  it("refuses a missing required link, a type not asked for, a duplicate and a bad URL", () => {
    expect(codeOf(() => milestone.check([]))).toBe("MISSING_REQUIRED_LINK");
    expect(
      codeOf(() =>
        milestone.check([
          { type: "GITHUB", url: "https://github.com/falcon/app" },
          { type: "DRIVE", url: "https://drive.google.com/file/d/x" },
        ]),
      ),
    ).toBe("LINK_NOT_ALLOWED");
    expect(
      codeOf(() =>
        milestone.check([
          { type: "GITHUB", url: "https://github.com/falcon/app" },
          { type: "GITHUB", url: "https://github.com/falcon/other" },
        ]),
      ),
    ).toBe("INVALID_LINK");
    expect(
      codeOf(() =>
        milestone.check([{ type: "GITHUB", url: "https://github.com/falcon" }]),
      ),
    ).toBe("INVALID_LINK");
    expect(
      codeOf(() => milestone.check([{ type: "GITHUB", url: "not a url" }])),
    ).toBe("INVALID_LINK");
    expect(
      codeOf(() =>
        milestone.check([{ type: "FIGMA", url: "https://figma.com/x" }]),
      ),
    ).toBe("LINK_NOT_ALLOWED");
  });

  it("accepts Drive only where Drive is required", () => {
    const final = LinkRequirement.from({ required: ["DRIVE"], optional: [] });
    expect(
      final.check([
        { type: "DRIVE", url: "https://docs.google.com/presentation/d/x" },
      ]),
    ).toHaveLength(1);
    expect(
      codeOf(() =>
        final.check([{ type: "GITHUB", url: "https://github.com/falcon/app" }]),
      ),
    ).toBe("LINK_NOT_ALLOWED");
  });

  it("checks its own shape: known types, no repeats, no overlap", () => {
    expect(codeOf(() => LinkRequirement.from(null))).toBe(
      "INVALID_LINK_REQUIREMENT",
    );
    expect(
      codeOf(() => LinkRequirement.from({ required: ["FIGMA"], optional: [] })),
    ).toBe("INVALID_LINK_REQUIREMENT");
    expect(
      codeOf(() =>
        LinkRequirement.from({ required: ["GITHUB", "GITHUB"], optional: [] }),
      ),
    ).toBe("INVALID_LINK_REQUIREMENT");
    expect(
      codeOf(() =>
        LinkRequirement.from({ required: ["GITHUB"], optional: ["GITHUB"] }),
      ),
    ).toBe("INVALID_LINK_REQUIREMENT");
    expect(
      LinkRequirement.from({
        required: [],
        optional: ["DRIVE", "GITHUB"],
      }).equals(LinkRequirement.IDEA_DEFAULT),
    ).toBe(true);
  });
});
