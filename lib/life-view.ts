import type { LifeState, LifeChoice } from "./life";

// 前端「断点恢复」：从已持久化的 LifeState 重建当前要展示的事件节点。
// 服务器每步都把整局状态存入 SQLite，玩家刷新/关页后再进来，
// 用最后一条 history 节点（待定决策或童年叙事）恢复出 story/title/choices。
export interface LifeView {
  lifeId: string;
  age: number;
  city: string;
  occupation: string;
  family: string;
  finance: string;
  health: string;
  eventTitle: string;
  story: string;
  choices: LifeChoice[];
  dead: boolean;
}

const FALLBACK_VIEW: LifeView = {
  lifeId: "",
  age: 0,
  city: "",
  occupation: "",
  family: "",
  finance: "",
  health: "",
  eventTitle: "",
  story: "",
  choices: [],
  dead: false,
};

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// 从持久化状态恢复展示数据：最后一个 history 节点就是玩家上次停下的位置
// （成年节点带 choices 等待选择；童年节点 choices 为空，前端显示"继续"）。
export function buildLifeView(state: LifeState | null | undefined): LifeView {
  if (!state) return FALLBACK_VIEW;
  const last = state.history.at(-1);
  const partner = state.relationships?.partner;
  return {
    lifeId: text(state.lifeId),
    age: typeof state.basic?.age === "number" ? state.basic.age : 0,
    city: text(state.basic?.city),
    occupation: text(state.career?.occupation),
    family: text(partner?.status) || (state.relationships?.children?.length ? "家人" : ""),
    finance: text(state.finance?.housing),
    health: text(state.health?.lifestyle),
    eventTitle: text(last?.title),
    story: text(last?.story),
    choices: Array.isArray(last?.choices) ? last.choices : [],
    dead: state.dead === true,
  };
}
