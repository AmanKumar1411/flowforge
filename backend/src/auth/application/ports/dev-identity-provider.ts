import { ExternalIdentity } from "../../domain/external-identity";
import { normalizeEmail } from "../../domain/university-identity-parser";

/** Development-only identity source. Throws AuthDomainError("DEV_LOGIN_DISABLED") when switched off. */
export abstract class DevIdentityProvider {
  abstract identify(email: string, name: string): ExternalIdentity;
  abstract assertEnabled(): void;
}

/** The provider sub a dev login uses, so accounts created ahead of time are found by it. */
export const devSubject = (email: string): string =>
  `dev|${normalizeEmail(email)}`;
