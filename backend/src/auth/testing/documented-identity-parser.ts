import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "dotenv";
import {
  IdentityPatterns,
  RishihoodIdentityParser,
} from "../infrastructure/rishihood-identity-parser";

// Specs read the patterns from .env.example, so the documented config is the tested config.
const documented = parse(
  readFileSync(join(__dirname, "..", "..", "..", ".env.example")),
);

export const documentedIdentityPatterns = (): IdentityPatterns => ({
  studentEmailPattern: new RegExp(documented["STUDENT_EMAIL_PATTERN"]),
  staffEmailPattern: new RegExp(documented["STAFF_EMAIL_PATTERN"]),
  batchBaseYear: Number(documented["BATCH_BASE_YEAR"]),
});

export const createDocumentedIdentityParser = (): RishihoodIdentityParser =>
  new RishihoodIdentityParser(documentedIdentityPatterns());
