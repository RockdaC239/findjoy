import { ModelError } from "./engine/errors";
import type { LifeState, NextEvent } from "./life";

/**
 * 程序侧寿命上限：普通/主题人生不再由模型无限延长。
 * 编辑分布（不是人口统计）：60～69 5%，70～79 40%，80～89 50%，90～94 4.5%，95～99 0.5%。
 * 90 岁以上因此应明显少见，95 岁以上极少。
 */
export function rollLifespan(random: () => number = Math.random): number {
  const roll = random();
  if (roll < 0.05) return 60 + Math.floor(random() * 10);
  if (roll < 0.45) return 70 + Math.floor(random() * 10);
  if (roll < 0.95) return 80 + Math.floor(random() * 10);
  if (roll < 0.995) return 90 + Math.floor(random() * 5);
  return 95 + Math.floor(random() * 5);
}

function normalLifespanLimit(state: LifeState): number | undefined {
  if (state.lifespan) return state.lifespan;
  // 旧存档没有 lifespan：普通/主题仍给一个保守上限，避免继续无限延长。
  return state.scenario?.mode === "normal" || state.scenario?.mode === "theme" ? 95 : undefined;
}

/**
 * 模型仍决定每幕故事；但寿命上限是程序事实。落地年龄触达上限时，
 * 即使模型返回 continue，也强制转为死亡，避免 90～100 岁被当成常规结局。
 */
export function enforceLifespan(event: NextEvent, state: LifeState): NextEvent {
  const limit = normalLifespanLimit(state);
  if (!limit) return event;
  const current = state.basic.age;
  const landing = current + Math.max(state.experienceVersion === 3 ? 0 : 1, event.timePassed);
  // 双幕讲述含多个年龄，不能靠改时间字段把越界经历变成已发生事实。
  if (state.experienceVersion === 3 && landing > limit) throw new ModelError("讲述超过本局生命终点，请在寿命上限内重新生成");
  if (event.outcome === "death") {
    if (landing <= limit) return event;
    return { ...event, timePassed: Math.max(state.experienceVersion === 3 ? 0 : 1, limit - current) };
  }
  if (landing < limit) return event;
  if (state.experienceVersion === 3) throw new ModelError("到达生命终点必须生成完整终幕，不允许继续事件或新的决策，请以death重新生成");
  const timePassed = Math.max(state.experienceVersion === 3 ? 0 : 1, limit - current);
  return {
    ...event,
    timePassed,
    outcome: "death",
    deathCause: "age",
    choices: [],
    event: { ...event.event, title: `${limit}岁，生命走到终点`, importance: 1 },
    ...(state.experienceVersion === 3 ? { narration: `${event.narration} 这一年，你${limit}岁，在熟悉的生活里安静离世。`, story: "" } : { story: `${event.story} 这一年，你${limit}岁，在熟悉的生活里安静离世。` }),
    memory: `你${limit}岁离世。`,
  };
}
