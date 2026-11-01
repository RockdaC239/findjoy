import * as oidc from "openid-client";
import { appOrigin } from "./auth";
import type { LoginTransaction } from "./identity-store";

let cached: Promise<oidc.Configuration> | undefined;

export function authingConfigured(): boolean {
  return Boolean(process.env.AUTHING_ISSUER && process.env.AUTHING_CLIENT_ID && process.env.FINDJOY_APP_ORIGIN);
}

export function authingConfiguration(): Promise<oidc.Configuration> {
  if (!cached) {
    const issuer = new URL(process.env.AUTHING_ISSUER ?? "");
    const clientId = process.env.AUTHING_CLIENT_ID;
    if (issuer.protocol !== "https:" || !clientId) throw new Error("认证配置不完整");
    const secret = process.env.AUTHING_CLIENT_SECRET;
    cached = oidc.discovery(issuer, clientId, { id_token_signed_response_alg: "RS256" },
      secret ? oidc.ClientSecretPost(secret) : oidc.None(),
      { execute: [oidc.enableNonRepudiationChecks] }).catch(error => { cached = undefined; throw error; });
  }
  return cached;
}

export async function authorizationRequest(returnTo: string) {
  const config = await authingConfiguration();
  const pending: LoginTransaction = {
    state: oidc.randomState(), nonce: oidc.randomNonce(),
    verifier: oidc.randomPKCECodeVerifier(), returnTo,
  };
  const url = oidc.buildAuthorizationUrl(config, {
    redirect_uri: `${appOrigin()}/findjoy/api/auth/callback`, scope: "openid profile",
    code_challenge: await oidc.calculatePKCECodeChallenge(pending.verifier),
    code_challenge_method: "S256", state: pending.state, nonce: pending.nonce,
    response_mode: "query",
  });
  return { url, pending };
}

export async function authenticateCallback(request: Request, pending: LoginTransaction) {
  const config = await authingConfiguration();
  const callbackUrl = new URL(`${appOrigin()}/findjoy/api/auth/callback`);
  callbackUrl.search = new URL(request.url).search;
  const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
    pkceCodeVerifier: pending.verifier, expectedState: pending.state,
    expectedNonce: pending.nonce, idTokenExpected: true,
  });
  const claims = tokens.claims();
  if (!claims?.sub) throw new Error("认证结果缺少身份");
  return { issuer: config.serverMetadata().issuer, subject: claims.sub,
    displayName: typeof claims.nickname === "string" ? claims.nickname : "探索者" };
}
