import { AppConfig } from "../../config/app-config";
import { createTestAppConfig } from "../../config/testing/test-environment";
import { LocalDevIdentityProvider } from "./dev-identity.provider";

jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));

describe("LocalDevIdentityProvider", () => {
  it("vouches for the given email as a verified identity of its domain", () => {
    const provider = new LocalDevIdentityProvider(createTestAppConfig());

    expect(
      provider.identify("  Rahul.25CSAI@NST.RISHIHOOD.EDU.IN ", " Rahul "),
    ).toEqual({
      sub: "dev|rahul.25csai@nst.rishihood.edu.in",
      email: "rahul.25csai@nst.rishihood.edu.in",
      emailVerified: true,
      hostedDomain: "nst.rishihood.edu.in",
      name: "Rahul",
      picture: null,
    });
  });

  it("refuses to work when disabled", () => {
    const provider = new LocalDevIdentityProvider(
      createTestAppConfig({ AUTH_DEV_LOGIN_ENABLED: "false" }),
    );

    expect(() =>
      provider.identify("rahul.25@nst.rishihood.edu.in", "R"),
    ).toThrow(expect.objectContaining({ code: "DEV_LOGIN_DISABLED" }) as Error);
  });

  it("refuses to work in production even if the flag were set", () => {
    const config = createTestAppConfig();
    const production = new AppConfig({
      ...config.values,
      nodeEnv: "production",
    });

    expect(() =>
      new LocalDevIdentityProvider(production).identify(
        "rahul.25@nst.rishihood.edu.in",
        "R",
      ),
    ).toThrow(expect.objectContaining({ code: "DEV_LOGIN_DISABLED" }) as Error);
  });
});
