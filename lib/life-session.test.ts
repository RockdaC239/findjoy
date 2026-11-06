import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readPendingStart, writePendingStart, clearPendingStart, discardPendingStartOnError } from "./life-session";
beforeEach(()=>{
 const values=new Map<string,string>();
 vi.stubGlobal("sessionStorage",{getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
});
afterEach(()=>vi.unstubAllGlobals());
const pending={gender:"female" as const,selection:{mode:"normal" as const},key:"original"};
it("keeps the original opening key when the start page is retried before its outcome is confirmed",()=>{
 writePendingStart(pending);writePendingStart({...pending,key:"new"});
 expect(readPendingStart()?.key).toBe("original");
 clearPendingStart();writePendingStart({...pending,key:"new"});expect(readPendingStart()?.key).toBe("new");
});
it.each([undefined,"START_UNCONFIRMED","START_PENDING","GENERATION_BUSY"])("preserves pending starts on uncertain or retryable errors: %s",code=>{
 writePendingStart(pending);discardPendingStartOnError(code);expect(readPendingStart()).toEqual(pending);
});
it.each(["START_FAILED","IDEMPOTENCY_CONFLICT","MODE_UNAVAILABLE"])("clears pending starts only on terminal responses: %s",code=>{
 writePendingStart(pending);discardPendingStartOnError(code);expect(readPendingStart()).toBeNull();
});

it("remembers only the matching life and event scene and clears it", async () => {
 const { rememberLifeScene, readLifeScene, clearLifeScene } = await import("./life-session");
 rememberLifeScene("life", "event", "decision");
 expect(readLifeScene("life", "event")).toBe("decision");
 expect(readLifeScene("other", "event")).toBeNull();
 expect(readLifeScene("life", "other")).toBeNull();
 clearLifeScene();
 expect(readLifeScene("life", "event")).toBeNull();
});
it("ignores malformed cursors and unavailable storage", async () => {
 const { readLifeScene, rememberLifeScene, clearLifeScene } = await import("./life-session");
 for (const raw of ['{', '{}', '{"lifeId":"life","eventId":"event","scene":"invented"}']) {
  vi.stubGlobal("sessionStorage", { getItem: () => raw });
  expect(readLifeScene("life", "event")).toBeNull();
 }
 vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); }, removeItem: () => { throw new Error(); } });
 expect(readLifeScene("life", "event")).toBeNull();
 expect(() => rememberLifeScene("life", "event", "review")).not.toThrow();
 expect(() => clearLifeScene()).not.toThrow();
});
