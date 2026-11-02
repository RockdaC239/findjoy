#!/usr/bin/env node
// 仅用于本地浏览器验收的 OIDC 替身：监听 127.0.0.1、自签名证书、自动批准。
// 不得用于生产，也不代表真实 Authing 的手机号验证或安全策略。
import { createHash, createPublicKey, generateKeyPairSync, randomBytes, randomUUID, sign } from "node:crypto";
import { createServer } from "node:https";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const port = Number(process.env.OIDC_PORT ?? 3443);
const issuer = `https://127.0.0.1:${port}/oidc`;
const clientId = process.env.OIDC_CLIENT_ID ?? "findjoy-e2e";
const redirectUri = process.env.OIDC_REDIRECT_URI ?? "http://localhost:3100/findjoy/api/auth/callback";
const subject = process.env.OIDC_SUBJECT ?? "mock-user-1";
const nickname = process.env.OIDC_NICKNAME ?? "测试探索者";
const phone = process.env.OIDC_PHONE ?? "+8613800000000";
const workDir = process.env.OIDC_WORK_DIR ?? path.resolve(".data/oidc-test");
const certFile = path.join(workDir, "cert.pem");
const keyFile = path.join(workDir, "key.pem");
mkdirSync(workDir, { recursive: true, mode: 0o700 });
if (!readFileSync(certFile, "utf8").includes("BEGIN CERTIFICATE")) throw new Error("missing test certificate");
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const kid = "findjoy-e2e-key";
const publicJwk = { ...createPublicKey(publicKey).export({ format: "jwk" }), kid, use: "sig", alg: "RS256" };
const codes = new Map();
const base64url = (value) => Buffer.from(value).toString("base64url");
const json = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};

function signIdToken(claims) {
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid }));
  const payload = base64url(JSON.stringify(claims));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url");
  return `${header}.${payload}.${signature}`;
}

const server = createServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, async (request, response) => {
  const url = new URL(request.url ?? "/", issuer);
  if (url.pathname === "/oidc/.well-known/openid-configuration") {
    return json(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}/auth`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      scopes_supported: ["openid", "profile", "phone"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      claims_supported: ["sub", "nickname", "phone_number", "phone_number_verified"],
    });
  }
  if (url.pathname === "/oidc/jwks") return json(response, 200, { keys: [publicJwk] });
  if (url.pathname === "/oidc/auth") {
    const state = url.searchParams.get("state") ?? "";
    const nonce = url.searchParams.get("nonce") ?? "";
    const challenge = url.searchParams.get("code_challenge") ?? "";
    const method = url.searchParams.get("code_challenge_method") ?? "";
    const returned = url.searchParams.get("redirect_uri") ?? "";
    if (url.searchParams.get("client_id") !== clientId || returned !== redirectUri || method !== "S256" || !challenge || !state) {
      return json(response, 400, { error: "invalid_request" });
    }
    const code = randomUUID();
    codes.set(code, { nonce, challenge, redirectUri: returned, createdAt: Date.now() });
    const location = new URL(returned);
    location.searchParams.set("code", code);
    location.searchParams.set("state", state);
    response.writeHead(302, { Location: location.toString(), "Cache-Control": "no-store" });
    response.end();
    return;
  }
  if (url.pathname === "/oidc/token" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const form = new URLSearchParams(body);
    const code = form.get("code") ?? "";
    const pending = codes.get(code);
    codes.delete(code);
    if (!pending || pending.redirectUri !== form.get("redirect_uri") || form.get("client_id") !== clientId || Date.now() - pending.createdAt > 120000) {
      return json(response, 400, { error: "invalid_grant" });
    }
    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (challenge !== pending.challenge) return json(response, 400, { error: "invalid_grant" });
    const now = Math.floor(Date.now() / 1000);
    const idToken = signIdToken({ iss: issuer, sub: subject, aud: clientId, azp: clientId, iat: now, exp: now + 3600, nonce: pending.nonce, nickname, phone_number: phone, phone_number_verified: true });
    return json(response, 200, { access_token: randomBytes(24).toString("base64url"), token_type: "Bearer", expires_in: 3600, id_token: idToken });
  }
  if (url.pathname === "/oidc/userinfo") {
    return json(response, 200, { sub: subject, nickname, phone_number: phone, phone_number_verified: true });
  }
  return json(response, 404, { error: "not_found" });
});
server.listen(port, "127.0.0.1", () => {
  writeFileSync(path.join(workDir, "issuer.json"), JSON.stringify({ issuer, clientId, redirectUri, subject }, null, 2));
  console.log(JSON.stringify({ issuer, clientId, redirectUri, subject }));
});
