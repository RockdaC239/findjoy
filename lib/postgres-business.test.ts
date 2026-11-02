import { expect, it } from "vitest";
import { setupTestPostgres } from "./test-postgres";
import { getPostgresPool } from "./database";
import { commerceStore } from "./commerce-store";
import { lifeStore } from "./life-store";
import { lifeGeneration } from "./life-generation";
import { createStarterLife } from "./life";
setupTestPostgres();

it("persists credits and saves in PostgreSQL and never over-reserves during simultaneous openings", async () => {
  await commerceStore.grantTrial("alice", 20);
  const attempts = await Promise.allSettled(Array.from({length: 8}, async (_, i) => (await commerceStore.beginLife("alice", `key-${i}`, "hash", createStarterLife()))));
  expect(attempts.filter(a => a.status === "fulfilled")).toHaveLength(1);
  expect(await commerceStore.balance("alice")).toEqual({available: 0, held: 20});
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM lives")).rows).toEqual([{n: 1}]);
});

it("confirms duplicate paid events once and atomically persists generated state and consumption", async () => {
  const order = await commerceStore.createOrder("alice", {id:"p",name:"p",credits:20,amountFen:100,demo:false}, "buy", "WECHAT_H5");
  await Promise.all(Array.from({length:8}, async () => (await commerceStore.confirmPaid(order.id,100,"trade","event"))));
  expect(await commerceStore.balance("alice")).toEqual({available:20,held:0});
  const life = createStarterLife();
  const op = await commerceStore.beginLife("alice","start","hash",life);
  await commerceStore.completeLife(op.id,"alice",life,[{role:"user",content:"opening"}]);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM joy_ledger")).rows).toEqual([{n:2}]);
  expect(await lifeStore.getTranscript(life.lifeId)).toHaveLength(1);
});

it("fences simultaneous generators and rejects an old worker after lease replacement", async () => {
  const life = createStarterLife(); await lifeStore.set(life,"alice");
  const attempts = await Promise.allSettled(Array.from({length:8}, async () => (await lifeGeneration.begin(life.lifeId,"alice",1000))));
  const won = attempts.filter(a => a.status === "fulfilled"); expect(won).toHaveLength(1);
  const first = won[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof lifeGeneration.begin>>>;
  const next = await lifeGeneration.begin(life.lifeId,"alice",700000);
  await expect(async () => (await lifeGeneration.save(first.value,life,[],700001))).rejects.toThrow();
  await lifeGeneration.save(next,life,[{role:"user",content:"next"}],700001);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM transcripts")).rows).toEqual([{n:1}]);
});

it("rolls back the life update when transcript serialization fails inside the shared transaction", async () => {
  const life=createStarterLife(); await lifeStore.set(life,"alice");
  const lease=await lifeGeneration.begin(life.lifeId,"alice");
  const changed={...life,basic:{...life.basic,city:"不应提交"}};
  await expect(lifeGeneration.save(lease,changed,[{role:"user",content:BigInt(1)}] as never)).rejects.toThrow();
  expect((await lifeStore.get(life.lifeId,"alice"))?.basic.city).toBe(life.basic.city);
  await lifeGeneration.save(lease,changed,[{role:"user",content:"valid"}]);
  expect((await lifeStore.get(life.lifeId,"alice"))?.basic.city).toBe("不应提交");
});

it("rolls back credit grants and callback records when a trade is reused by another order", async () => {
  const product={id:"p",name:"p",credits:20,amountFen:100,demo:false};
  const one=await commerceStore.createOrder("alice",product,"one","WECHAT_H5");
  const two=await commerceStore.createOrder("alice",product,"two","WECHAT_H5");
  await commerceStore.confirmPaid(one.id,100,"same-trade","first");
  await expect(commerceStore.confirmPaid(two.id,100,"same-trade","second")).rejects.toThrow();
  expect(await commerceStore.balance("alice")).toEqual({available:20,held:0});
  expect((await commerceStore.getOrder(two.id,"alice"))?.status).toBe("CREATED");
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM joy_payment_events WHERE event_id='second'")).rows).toEqual([{n:0}]);
});

it("replays concurrent opening keys without extra holds and releases the hold only once", async () => {
  await commerceStore.grantTrial("alice",100);
  const operations=await Promise.all(Array.from({length:8}, () => commerceStore.beginLife("alice","same","hash",createStarterLife())));
  expect(new Set(operations.map(op => op.id)).size).toBe(1);
  expect(await commerceStore.balance("alice")).toEqual({available:80,held:20});
  await Promise.all(operations.map(op => commerceStore.failLife(op.id,"alice")));
  expect(await commerceStore.balance("alice")).toEqual({available:100,held:0});
  expect(await lifeStore.get(operations[0].lifeId,"alice")).toBeNull();
});
