# 本地 OIDC 登录替身

仅用于本机浏览器验收，**不得用于生产**。它监听 `127.0.0.1`，使用自签名证书，自动批准登录，不验证短信、密码、风控或真实 Authing 策略。

用途：在没有真实测试手机号的情况下，验证 FindJoy 自己的 `/api/auth/login` → `/api/auth/callback` → 会话 Cookie、赠送积分和后续游戏/购买/恢复链路。

## 准备证书

```bash
mkdir -p .data/oidc-test
openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout .data/oidc-test/key.pem -out .data/oidc-test/cert.pem -days 2 \
  -subj '/CN=127.0.0.1' -addext 'subjectAltName=IP:127.0.0.1,DNS:localhost'
```

## 启动替身与隔离实例

```bash
node scripts/testing/mock-oidc.mjs
```

另一个终端启动生产构建（先 `npm run build`），使用独立数据库和 `demo` 支付：

```bash
FINDJOY_APP_ORIGIN=http://localhost:3100 \
AUTHING_ISSUER=https://127.0.0.1:3443/oidc \
AUTHING_CLIENT_ID=findjoy-e2e \
DATABASE_URL='postgresql://.../findjoy_e2e_oidc' \
FINDJOY_PAYMENTS_MODE=demo \
FINDJOY_MODEL_CONFIG_MODE=environment \
LLM_BASE_URL=http://127.0.0.1:3101/v1 LLM_API_KEY=mock LLM_MODEL=mock \
NODE_EXTRA_CA_CERTS="$PWD/.data/oidc-test/cert.pem" \
npx next start -H 127.0.0.1 -p 3100
```

模型端口可用仓库已有的合成模型替身；只允许本地回环地址。浏览器首次打开自签名 HTTPS 时需手动继续，或仅在测试浏览器中忽略证书错误；不要把这套配置用于任何真实域名。

## 覆盖范围与限制

- 覆盖：登录跳转、OIDC code + PKCE 回调、会话 Cookie、新用户体验积分、普通模式开局、演示购买、恢复存档、桌面/移动布局。
- 不覆盖：真实 Authing 手机号验证码、真实支付/退款、真实模型、生产域名和证书。
- 测试结束后停止替身和隔离实例，不保留测试令牌或用户数据。
