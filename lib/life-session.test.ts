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
