import {afterEach,expect,it} from "vitest";
import {takeRateLimit} from "./rate-limit";
import {lifeStore} from "./life-store";
afterEach(()=>lifeStore.close());
it("enforces independent bounded windows and resets after expiry",()=>{
 expect(takeRateLimit("alice","orders",2,60000,1000)).toBe(true);
 expect(takeRateLimit("alice","orders",2,60000,1001)).toBe(true);
 expect(takeRateLimit("alice","orders",2,60000,1002)).toBe(false);
 expect(takeRateLimit("bob","orders",2,60000,1002)).toBe(true);
 expect(takeRateLimit("alice","orders",2,60000,62000)).toBe(true);
});
