import { describe, expect, it } from "vitest";
import { ApiError } from "./api/client";
import { inScreenWords, readableError } from "./errors";

describe("inScreenWords", () => {
  it("says project where the API says cycle, keeping the case", () => {
    expect(inScreenWords("Cycle not found")).toBe("Project not found");
    expect(inScreenWords("This cycle's teams are final; closed cycles cannot change.")).toBe(
      "This project's teams are final; closed projects cannot change.",
    );
    // Only the whole word: an identifier stays as it is.
    expect(inScreenWords("bicycle cycleId")).toBe("bicycle cycleId");
  });

  it("applies to API messages that have no message of their own on the screen", () => {
    expect(readableError(new ApiError("A field of this cycle is locked", "SOME_NEW_CODE", 409))).toBe(
      "A field of this project is locked",
    );
  });
});
