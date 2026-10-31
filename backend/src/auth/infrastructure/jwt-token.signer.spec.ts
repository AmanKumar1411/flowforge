jest.mock("@nestjs/common", () => ({
  Injectable: () => (target: unknown) => target,
}));
// Only its type is used: the test hands the signer a recording JwtService.
jest.mock("@nestjs/jwt", () => ({ JwtService: class {} }));

import type { JwtService } from "@nestjs/jwt";
import { KeyObject } from "node:crypto";
import * as jsonwebtoken from "jsonwebtoken";
import { createTestAppConfig } from "../../config/testing/test-environment";
import { JwtTokenSigner } from "./jwt-token.signer";

type KeyOptions = {
  secret?: unknown;
  privateKey?: KeyObject;
  publicKey?: KeyObject;
} & Record<string, unknown>;

/** JwtService as @nestjs/jwt runs it: the key goes to jsonwebtoken, the rest are its options. */
function recordingJwt(keys: unknown[]): JwtService {
  const split = ({ secret, privateKey, publicKey, ...rest }: KeyOptions) => {
    keys.push(secret ?? privateKey ?? publicKey);
    return { key: (privateKey ?? publicKey) as KeyObject, rest };
  };
  return {
    signAsync: (payload: object, options: KeyOptions) => {
      const { key, rest } = split(options);
      return Promise.resolve(jsonwebtoken.sign(payload, key, rest));
    },
    verifyAsync: (token: string, options: KeyOptions) => {
      const { key, rest } = split(options);
      return Promise.resolve(jsonwebtoken.verify(token, key, rest));
    },
  } as unknown as JwtService;
}

describe("JwtTokenSigner", () => {
  it("builds its key once and uses that KeyObject for every sign and verify, never the string secret", async () => {
    const keys: unknown[] = [];
    const signer = new JwtTokenSigner(
      recordingJwt(keys),
      createTestAppConfig(),
    );
    for (let round = 0; round < 3; round += 1) {
      const { token } = await signer.sign({ sub: "user-1", ver: 2 });
      await expect(signer.verify(token)).resolves.toEqual({
        sub: "user-1",
        ver: 2,
      });
    }
    expect(keys).toHaveLength(6);
    const [first] = keys;
    expect(first).toBeInstanceOf(KeyObject);
    expect((first as KeyObject).type).toBe("secret");
    expect(keys.every((key) => key === first)).toBe(true);
  });

  it("still refuses a token signed with another secret", async () => {
    const signer = new JwtTokenSigner(recordingJwt([]), createTestAppConfig());
    const forged = jsonwebtoken.sign(
      { sub: "user-1", ver: 0 },
      "x".repeat(40),
      {
        algorithm: "HS256",
        issuer: "flowforge-api",
        audience: "flowforge-web",
      },
    );
    await expect(signer.verify(forged)).rejects.toMatchObject({
      code: "UNAUTHENTICATED",
    });
  });
});
