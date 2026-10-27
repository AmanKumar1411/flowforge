import { ExternalIdentity } from "../../domain/external-identity";

/** Development-only identity source. Throws AuthDomainError("DEV_LOGIN_DISABLED") when switched off. */
export abstract class DevIdentityProvider {
  abstract identify(email: string, name: string): ExternalIdentity;
}
