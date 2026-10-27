import { createSign, generateKeyPairSync } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { GoogleAuthLibraryClient } from "./google-oauth.client";

// Real google-auth-library verification, with Google's signing key swapped for a local one.
const signingKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicPem = signingKey.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();

const audience = "flowforge-test.apps.googleusercontent.com";
const now = () => Math.floor(Date.now() / 1000);

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

const signIdToken = (
  claims: Record<string, unknown>,
  key = signingKey.privateKey,
): string => {
  const unsigned = `${base64url({ alg: "RS256", typ: "JWT", kid: "test-key" })}.${base64url(
    {
      iss: "https://accounts.google.com",
      aud: audience,
      sub: "google-sub-1",
      email: "prakriti.p@nst.rishihood.edu.in",
      email_verified: true,
      hd: "nst.rishihood.edu.in",
      nonce: "nonce-1",
      iat: now(),
      exp: now() + 3600,
      ...claims,
    },
  )}`;
  const signature = createSign("RSA-SHA256")
    .update(unsigned)
    .sign(key)
    .toString("base64url");
  return `${unsigned}.${signature}`;
};

type CertsResponse = Awaited<
  ReturnType<OAuth2Client["getFederatedSignonCertsAsync"]>
>;

describe("GoogleAuthLibraryClient.verifyIdToken", () => {
  const oauth = new OAuth2Client({ clientId: audience });
  jest.spyOn(oauth, "getFederatedSignonCertsAsync").mockResolvedValue({
    certs: { "test-key": publicPem },
    format: "PEM" as CertsResponse["format"],
  });
  const client = new GoogleAuthLibraryClient(oauth, audience);

  it("returns the claims of a correctly signed token", async () => {
    await expect(client.verifyIdToken(signIdToken({}))).resolves.toMatchObject({
      sub: "google-sub-1",
      hd: "nst.rishihood.edu.in",
      nonce: "nonce-1",
    });
  });

  it.each([
    ["the wrong audience", { aud: "someone-else.apps.googleusercontent.com" }],
    ["the wrong issuer", { iss: "https://evil.example.com" }],
    ["an expiry in the past", { iat: now() - 7200, exp: now() - 3600 }],
  ])("rejects a token with %s", async (_, claims) => {
    await expect(client.verifyIdToken(signIdToken(claims))).rejects.toThrow();
  });

  it("rejects a token signed by another key", async () => {
    await expect(
      client.verifyIdToken(signIdToken({}, otherKey.privateKey)),
    ).rejects.toThrow(/signature/i);
  });
});
