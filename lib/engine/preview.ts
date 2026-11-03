import { applyNextEvent, type NextEvent } from "../life";
import { SCRIPTS } from "../modes/catalog";
import { createStartLife, resolveStartPlan } from "../modes/start";
import type { LifeMode, StartSelection, ThemeId } from "../modes/types";
import { buildEndingMessages, buildTranscriptUserContent, prepareEventRequest, type TranscriptMessage } from "./context";
import { serializeTranscriptEvent } from "./event-contract";

export interface PreviewOptions {
  mode: LifeMode;
  stage: "opening" | "next" | "ending";
  theme: ThemeId;
  scriptId?: string;
  legacy: boolean;
}

// 仅使用合成资料，不读取存档、环境配置或真实 ForU 用户数据。
export function previewMessages(options: PreviewOptions) {
  const selection: StartSelection = options.mode === "theme"
    ? { mode: "theme", theme: options.theme }
    : options.mode === "script"
      ? { mode: "script", scriptId: options.scriptId ?? SCRIPTS[0].id }
      : options.mode === "foru"
        ? { mode: "foru", brief: { age: 32, city: "成都", occupation: "教师", family: "与家人同住", relationship: "single", economy: "ordinary", health: "good", housing: "rent", situation: "正在考虑换一份工作（合成样例）", focus: "职业与生活的取舍" } }
        : { mode: "normal" };
  let state = createStartLife(resolveStartPlan(selection, { random: () => 0.5 }), "female");
  state.lifeId = "prompt-preview-synthetic";
  state.createdAt = "2026-01-01T00:00:00.000Z";
  if (options.mode === "normal" || options.mode === "theme") state.basic.city = "成都";
  let transcript: TranscriptMessage[] = [];
  let choice;
  if (options.stage !== "opening") {
    state.basic.age = Math.max(32, state.basic.age);
    state.career.occupation = "教师";
    const event: NextEvent = {
      timePassed: 0,
      story: "你收到一份外地工作的邀请，家人正等着你一起吃晚饭。（合成样例）",
      event: { type: "career", title: "一封外地工作的邀请", importance: 0.8 },
      choices: [{ id: "A", text: "接受邀请，去新的城市试试" }, { id: "B", text: "留在家人身边，继续现在的工作" }],
      objectiveChanges: {}, memory: "你曾在工作机会与熟悉的生活之间犹豫。",
    };
    transcript = [{ role: "user", content: buildTranscriptUserContent(state, undefined, true) }, { role: "assistant", content: serializeTranscriptEvent(event) }];
    state = applyNextEvent(state, event, undefined, { allowZeroTime: true });
    state.history[0].id = "synthetic-event";
    state.history[0].storedAt = state.createdAt;
    choice = event.choices[0];
  }
  if (options.stage === "ending") {
    state.basic.age = 80;
    state.dead = true;
    state.flags.deathCause = "natural";
    return buildEndingMessages(state);
  }
  return prepareEventRequest(state, choice, options.legacy ? null : transcript).messages;
}
