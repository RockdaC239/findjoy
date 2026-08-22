# FindJoy · 觅乐

FindJoy 是一款由 AI 驱动的人生模拟游戏。你从人生的某个起点开始，在关系、工作、家庭、健康、金钱和自我实现之间不断做出选择，直到回望这一生。

它不提供“人生成功分数”，也不替你判断什么样的人生才是正确答案。

## 本地运行

需要 Node.js 20 或更高版本：

```bash
npm install
npm run dev
```

打开 `http://localhost:3000/findjoy`。本地开发模式下，点击右上角“模型设置”，填写供应商、API Key 和模型，点击“确认并保存”。配置会由本地服务端保存到：

```text
.data/model-config.json
```

`.data/` 已加入 `.gitignore`，不会被提交。API Key 只用于本地服务端请求，不会写入人生数据库、日志或返回给浏览器。更换模型时重新保存即可。

项目支持 OpenAI 兼容的 `/chat/completions` 接口。供应商和推荐模型目录见 [`lib/provider-catalog.ts`](./lib/provider-catalog.ts)。

## 线上部署

生产环境默认使用环境变量模式，忽略浏览器传来的自定义模型配置。复制 `.env.example` 为 `.env.local`，然后配置：

```env
FINDJOY_MODEL_CONFIG_MODE=environment
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=deepseek-chat
```

线上页面会展示“服务端环境变量”状态，用户不能修改模型。不要把真实 Key 写入仓库；部署平台的密钥管理功能优先于 `.env.local`。

## 开发与验证

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 欢迎 PR

FindJoy 是一个开放的实验项目，欢迎提交 Issue、改进建议和 Pull Request。你可以从文案、人生事件设计、模型适配、可访问性、测试和部署体验等方向参与。

提交 PR 前，请尽量说明改动动机、用户可见变化和验证命令；涉及模型提示词、模型配置或数据持久化的改动，也请在 PR 描述中明确标注。

## 安全提醒

API Key 等同于账户凭证。不要把 `.data/model-config.json`、`.env.local` 或真实 Key 提交到 Git，也不要在公共电脑上保存自己的 Key。
