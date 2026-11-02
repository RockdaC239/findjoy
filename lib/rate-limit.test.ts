import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import {afterEach,expect,it} from "vitest";
import {takeRateLimit} from "./rate-limit";
import {lifeStore} from "./life-store";
afterEach(async ()=>(await lifeStore.close()));
it("enforces independent bounded windows and resets after expiry",async ()=>{
 expect(await takeRateLimit("alice","orders",2,60000,1000)).toBe(true);
 expect(await takeRateLimit("alice","orders",2,60000,1001)).toBe(true);
 expect(await takeRateLimit("alice","orders",2,60000,1002)).toBe(false);
 expect(await takeRateLimit("bob","orders",2,60000,1002)).toBe(true);
 expect(await takeRateLimit("alice","orders",2,60000,62000)).toBe(true);
});
