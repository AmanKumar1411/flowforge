import { describe, expect, it } from "vitest";
import { allowedTypes, linkProblem, linkProblems, linksFrom, requirementText } from "./links";

const milestone = { required: ["GITHUB" as const], optional: ["DEMO" as const, "REPORT" as const] };

describe("links", () => {
  it("describes a requirement, required types first", () => {
    expect(requirementText(milestone)).toBe("GitHub repository required · Demo, Report optional");
    expect(requirementText({ required: [], optional: [] })).toBe("No links");
    expect(allowedTypes({ required: ["DRIVE"], optional: ["GITHUB"] })).toEqual(["DRIVE", "GITHUB"]);
  });

  it("mirrors the API's checks per type", () => {
    expect(linkProblem("GITHUB", "https://github.com/falcon/app")).toBeNull();
    expect(linkProblem("GITHUB", "https://github.com/falcon")).toMatch(/repository/);
    expect(linkProblem("DRIVE", "https://docs.google.com/document/d/x")).toBeNull();
    expect(linkProblem("DRIVE", "https://dropbox.com/x")).toMatch(/Drive/);
    expect(linkProblem("DEMO", "http://falcon.app")).toMatch(/https/);
    expect(linkProblem("REPORT", "https://example.org/r.pdf")).toBeNull();
  });

  it("keeps the links typed in and reports a missing required one", () => {
    const values = { GITHUB: " https://github.com/falcon/app ", DEMO: "" };
    expect(linksFrom(milestone, values)).toEqual([{ type: "GITHUB", url: "https://github.com/falcon/app" }]);
    expect(linkProblems(milestone, values)).toEqual({});
    expect(linkProblems(milestone, {})).toEqual({ GITHUB: "Add the GitHub repository link." });
  });
});
