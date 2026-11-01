import type { Product } from "./commerce-store";

export function products(): Product[] {
  if (process.env.FINDJOY_PAYMENTS_MODE !== "live") return [
    {id:"one-life", name:"一次出走", credits:1, amountFen:990, demo:true},
    {id:"possibilities", name:"几种可能", credits:5, amountFen:2990, demo:true},
    {id:"wanderer", name:"人生漫游", credits:15, amountFen:6990, demo:true},
  ];
  const value: unknown = JSON.parse(process.env.FINDJOY_PRODUCTS_JSON ?? "[]");
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("尚未配置正式商品");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("商品配置无效");
    const item=entry as Record<string,unknown>;
    if (typeof item.id!=="string" || !/^[a-z0-9-]{1,40}$/.test(item.id) || ids.has(item.id) || typeof item.name!=="string" || !item.name.trim() || item.name.length>80 || !Number.isSafeInteger(item.credits) || Number(item.credits)<1 || Number(item.credits)>1000 || !Number.isSafeInteger(item.amountFen) || Number(item.amountFen)<1 || Number(item.amountFen)>100000) throw new Error("商品配置无效");
    ids.add(item.id);
    return {id:item.id,name:item.name,credits:Number(item.credits),amountFen:Number(item.amountFen),demo:false};
  });
}

export const formatPrice = (amountFen: number) => (amountFen/100).toFixed(2).replace(/\.00$/, "");
