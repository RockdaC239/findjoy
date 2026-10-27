import type { EventType } from "./life";
import type { LifeScenario } from "./modes/types";

export type MusicMood = "calm" | "warm" | "reflective" | "tense" | "bright";
export type MusicPhase = "start" | "event" | "review";

export interface MusicScene {
  id: string;
  label: string;
  /** MIDI 音高，48 = C3。 */
  rootMidi: number;
  mood: MusicMood;
}

const START_SCENE: MusicScene = { id: "start", label: "开始", rootMidi: 48, mood: "calm" };
const REVIEW_SCENE: MusicScene = { id: "review", label: "回顾", rootMidi: 43, mood: "reflective" };
const FORU_SCENE: MusicScene = { id: "foru", label: "ForU", rootMidi: 46, mood: "reflective" };

const EVENT_SCENES: Record<EventType, MusicScene> = {
  family: { id: "event-family", label: "家庭", rootMidi: 50, mood: "warm" },
  relationship: { id: "event-relationship", label: "关系", rootMidi: 55, mood: "warm" },
  career: { id: "event-career", label: "事业", rootMidi: 48, mood: "calm" },
  finance: { id: "event-finance", label: "财务", rootMidi: 45, mood: "calm" },
  health: { id: "event-health", label: "健康", rootMidi: 43, mood: "reflective" },
  random: { id: "event-random", label: "日常", rootMidi: 48, mood: "calm" },
};

const THEME_SCENES: Record<string, MusicScene> = {
  love: { id: "theme-love", label: "爱情", rootMidi: 55, mood: "warm" },
  family: { id: "theme-family", label: "亲情", rootMidi: 50, mood: "warm" },
  career: { id: "theme-career", label: "事业", rootMidi: 48, mood: "calm" },
};

const ERA_SCENES: Record<string, MusicScene> = {
  "1980s": { id: "era-1980s", label: "八十年代", rootMidi: 50, mood: "warm" },
  "1990s": { id: "era-1990s", label: "九十年代", rootMidi: 45, mood: "reflective" },
  "2000s": { id: "era-2000s", label: "千禧年", rootMidi: 52, mood: "bright" },
  republic: { id: "era-republic", label: "民国", rootMidi: 46, mood: "tense" },
  now: { id: "era-now", label: "当代", rootMidi: 48, mood: "calm" },
};

/** 纯函数：根据阶段、玩法与当前事件类型选一个氛围场景，便于测试。 */
export function musicSceneFor(input: {
  phase: MusicPhase;
  scenario?: LifeScenario;
  eventType?: EventType;
}): MusicScene {
  if (input.phase === "start") return START_SCENE;
  if (input.phase === "review") return REVIEW_SCENE;
  const scenario = input.scenario;
  if (scenario?.mode === "script") return ERA_SCENES[scenario.eraId] ?? EVENT_SCENES.random;
  if (scenario?.mode === "theme") return THEME_SCENES[scenario.theme] ?? EVENT_SCENES.random;
  if (scenario?.mode === "foru") return FORU_SCENE;
  return input.eventType ? EVENT_SCENES[input.eventType] : EVENT_SCENES.random;
}
