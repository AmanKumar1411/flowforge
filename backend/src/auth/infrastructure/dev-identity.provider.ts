import { Injectable } from "@nestjs/common";
import { AppConfig } from "../../config/app-config";
import { DevIdentityProvider } from "../application/ports/dev-identity-provider";
import { AuthDomainError } from "../domain/auth.errors";
import { ExternalIdentity } from "../domain/external-identity";
import { normalizeEmail } from "../domain/university-identity-parser";

/**
 * Development and test stand-in for Google. It vouches for whatever email it
 * is given, so it is only enabled outside production (checked at boot too).
 */
@Injectable()
export class LocalDevIdentityProvider extends DevIdentityProvider {
  constructor(private readonly config: AppConfig) {
    super();
  }

  identify(email: string, name: string): ExternalIdentity {
    if (!this.config.values.devLoginEnabled || this.config.isProduction) {
      throw new AuthDomainError(
        "DEV_LOGIN_DISABLED",
        "Dev login is not enabled on this server",
      );
    }
    const normalized = normalizeEmail(email);
    return {
      sub: `dev|${normalized}`,
      email: normalized,
      emailVerified: true,
      hostedDomain: normalized.slice(normalized.lastIndexOf("@") + 1) || null,
      name: name.trim(),
      picture: null,
    };
  }
}
