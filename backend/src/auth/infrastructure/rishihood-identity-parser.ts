import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  InvalidUniversityIdentityError,
  normalizeEmail,
  UniversityIdentity,
  UniversityIdentityParser,
} from "../domain/university-identity-parser";

@Injectable()
export class RishihoodIdentityParser extends UniversityIdentityParser {
  private readonly allowedDomains: ReadonlySet<string>;
  private readonly batchEmailPattern: RegExp;
  private readonly batchBaseYear: number;

  constructor(config: ConfigService) {
    super();
    this.allowedDomains = new Set(
      config
        .getOrThrow<string>("ALLOWED_UNIVERSITY_EMAIL_DOMAINS")
        .split(",")
        .map((domain) => domain.trim().toLowerCase()),
    );
    this.batchEmailPattern = new RegExp(
      config.getOrThrow<string>("BATCH_EMAIL_PATTERN"),
    );
    this.batchBaseYear = Number(config.getOrThrow<string>("BATCH_BASE_YEAR"));
  }

  parse(email: string): UniversityIdentity {
    const normalizedEmail = normalizeEmail(email);
    const separator = normalizedEmail.lastIndexOf("@");
    if (
      separator <= 0 ||
      separator !== normalizedEmail.indexOf("@") ||
      separator === normalizedEmail.length - 1
    ) {
      throw new InvalidUniversityIdentityError("Email address is malformed");
    }

    const localPart = normalizedEmail.slice(0, separator);
    const domain = normalizedEmail.slice(separator + 1);
    if (!this.allowedDomains.has(domain)) {
      throw new InvalidUniversityIdentityError("Email domain is not allowed");
    }

    const match = this.batchEmailPattern.exec(localPart);
    const batchToken = match?.groups?.["batch"];
    return {
      email: normalizedEmail,
      batchYear: batchToken ? this.batchBaseYear + Number(batchToken) : null,
    };
  }
}
