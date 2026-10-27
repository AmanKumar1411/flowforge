import {
  createDocumentedIdentityParser,
  documentedIdentityPatterns,
} from "../testing/documented-identity-parser";
import { RishihoodIdentityParser } from "./rishihood-identity-parser";

const domain = "@nst.rishihood.edu.in";
const parser = createDocumentedIdentityParser();

describe("RishihoodIdentityParser", () => {
  describe("student emails", () => {
    it.each([
      ["aman.k23csai", 2023],
      ["rahul.s24csai", 2024],
      ["priya.m25csai", 2025],
      ["neha.t26csai", 2026],
      ["aman.kr23csai", 2023],
      ["rahul.25", 2025],
      ["rahul.25csai", 2025],
    ])("classifies %s as a student of batch %i", (localPart, batchYear) => {
      expect(parser.parse(`${localPart}${domain}`)).toEqual({
        kind: "STUDENT",
        email: `${localPart}${domain}`,
        batchYear,
      });
    });

    it("normalizes case and surrounding whitespace before matching", () => {
      expect(parser.parse("  AMAN.K23CSAI@NST.RISHIHOOD.EDU.IN  ")).toEqual({
        kind: "STUDENT",
        email: `aman.k23csai${domain}`,
        batchYear: 2023,
      });
    });

    it.each(["rahul.2025", "rahul.k2025csai", "rahul.5", "rahul.k5csai"])(
      "rejects %s because the year is not exactly two digits",
      (localPart) => {
        expect(parser.parse(`${localPart}${domain}`).kind).toBe("UNRECOGNIZED");
      },
    );

    it("never treats an address without year digits as a student", () => {
      expect(parser.parse(`aman.kcsai${domain}`).kind).not.toBe("STUDENT");
    });

    it("reads two digits after the initials as a year, even on a staff-like name", () => {
      // The batch range check, not the parser, rejects implausible years like 2012.
      expect(parser.parse(`sahil.a12${domain}`)).toEqual({
        kind: "STUDENT",
        email: `sahil.a12${domain}`,
        batchYear: 2012,
      });
    });
  });

  describe("staff emails", () => {
    it.each(["prakriti.p", "sahil.a", "vatsala.s", "sahil.a2", "anil.kr"])(
      "classifies %s as staff",
      (localPart) => {
        expect(parser.parse(`${localPart}${domain}`)).toEqual({
          kind: "STAFF",
          email: `${localPart}${domain}`,
        });
      },
    );

    it.each(["sahil.a123", "sahil.", "sahil", ".a"])(
      "rejects %s",
      (localPart) => {
        expect(parser.parse(`${localPart}${domain}`).kind).toBe("UNRECOGNIZED");
      },
    );
  });

  it.each([
    "aman.k23csai@gmail.com",
    "aman.k23csai@nst.rishihood.edu.in.evil.com",
    "aman.k23csai@evil.nst.rishihood.edu.in",
    "prakriti.p@rishihood.edu.in",
    "aman k23csai@nst.rishihood.edu.in",
    "not-an-email",
    "",
  ])("rejects %j outside the university email formats", (email) => {
    expect(parser.parse(email).kind).toBe("UNRECOGNIZED");
  });

  it("uses the configured patterns and base year", () => {
    const custom = new RishihoodIdentityParser({
      studentEmailPattern: /^[a-z]+_(\d{2})@example\.edu$/,
      staffEmailPattern: /^[a-z]+@staff\.example\.edu$/,
      batchBaseYear: 1900,
    });

    expect(custom.parse("aman_99@example.edu")).toEqual({
      kind: "STUDENT",
      email: "aman_99@example.edu",
      batchYear: 1999,
    });
    expect(custom.parse("prakriti@staff.example.edu").kind).toBe("STAFF");
    expect(custom.parse(`aman.k23csai${domain}`).kind).toBe("UNRECOGNIZED");
  });
});

describe("documented student and staff patterns", () => {
  const samples = [
    "aman.k23csai",
    "rahul.s24csai",
    "priya.m25csai",
    "rahul.25",
    "rahul.25csai",
    "aman.kr23csai",
    "prakriti.p",
    "sahil.a",
    "sahil.a2",
    "vatsala.s",
    "aman.kcsai",
    "rahul.2025",
    "rahul.5",
    "sahil.a12",
    "a.b1",
    "a.b12",
    "a.12b",
  ].map((localPart) => `${localPart}${domain}`);

  const { studentEmailPattern, staffEmailPattern } =
    documentedIdentityPatterns();

  it.each(samples)("%s matches at most one of the two patterns", (email) => {
    expect(
      studentEmailPattern.test(email) && staffEmailPattern.test(email),
    ).toBe(false);
  });
});
