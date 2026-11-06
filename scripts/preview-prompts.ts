import { MODEL_OUTPUT_VERSION, LEGACY_MODEL_OUTPUT_VERSION } from "../lib/engine/output-format";
import { parseArgs } from "node:util";
import { previewMessages, type PreviewOptions } from "../lib/engine/preview";

try {
  const { values } = parseArgs({ options: {
    mode: { type: "string", default: "normal" },
    stage: { type: "string", default: "opening" },
    theme: { type: "string", default: "love" },
    script: { type: "string" },
    legacy: { type: "boolean", default: false },
    "experience-version": { type: "string", default: String(MODEL_OUTPUT_VERSION) },
    json: { type: "boolean", default: false },
  } });
  if (!["normal", "theme", "script", "foru"].includes(values.mode)) throw new Error("mode 必须为 normal/theme/script/foru");
  if (!["opening", "next", "ending"].includes(values.stage)) throw new Error("stage 必须为 opening/next/ending");
  if (!["love", "family", "career"].includes(values.theme)) throw new Error("theme 必须为 love/family/career");
  const experienceVersion = Number(values["experience-version"]);
  if (experienceVersion !== MODEL_OUTPUT_VERSION && experienceVersion !== LEGACY_MODEL_OUTPUT_VERSION) throw new Error("experience-version 必须为 2/3");
  const messages = previewMessages({ mode: values.mode, stage: values.stage, theme: values.theme, scriptId: values.script, legacy: values.legacy, experienceVersion } as PreviewOptions);
  console.log(values.json ? JSON.stringify(messages, null, 2) : `# 提示词预览（合成资料，事件协议 v${experienceVersion}）\n\n` + messages.map((message, index) => `## ${index + 1}. ${message.role}\n\n${message.content}`).join("\n\n"));
} catch (error) {
  console.error(error instanceof Error ? error.message : "预览失败");
  process.exitCode = 1;
}
