import type { LifeState } from "./life";
const store = new Map<string, LifeState>();
export const lifeStore = { get: (id: string) => store.get(id), set: (state: LifeState) => (store.set(state.lifeId, state), state) };

