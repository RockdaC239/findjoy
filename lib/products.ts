import type { Product } from "./commerce-store";

export const DEVELOPER_TEST_PRODUCT_ID = "developer-test";

function configuredProducts(): Product[] {
  if (process.env.FINDJOY_PAYMENTS_MODE !== "live") return [
    {id:"single",name:"普通模式单次",credits:20,amountFen:590,demo:true},
    {id:"light",name:"尝鲜包",credits:40,amountFen:990,demo:true},
    {id:"standard",name:"标准包",credits:100,amountFen:1990,demo:true},
    {id:"explore",name:"探索包",credits:220,amountFen:3990,demo:true},
    {id:"deep",name:"深度包",credits:480,amountFen:7990,demo:true},
  ];
  const value: unknown = JSON.parse(process.env.FINDJOY_PRODUCTS_JSON ?? "[]");
  if (!Array.isArray(value) || value.length < 1 || value.length > 10) throw new Error("尚未配置正式商品");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("商品配置无效");
    const item=entry as Record<string,unknown>;
    if (typeof item.id!=="string" || !/^[a-z0-9-]{1,40}$/.test(item.id) || (ids.has(item.id) || item.id === DEVELOPER_TEST_PRODUCT_ID) || typeof item.name!=="string" || !item.name.trim() || item.name.length>80 || !Number.isSafeInteger(item.credits) || Number(item.credits)<1 || Number(item.credits)>1000 || !Number.isSafeInteger(item.amountFen) || Number(item.amountFen)<1 || Number(item.amountFen)>100000) throw new Error("商品配置无效");
    ids.add(item.id);
    return {id:item.id,name:item.name,credits:Number(item.credits),amountFen:Number(item.amountFen),demo:false};
  });
}

export const formatPrice = (amountFen: number) => (amountFen/100).toFixed(2).replace(/\.00$/, "");

// developer 只能由服务端手机号校验结果决定，不能读取客户端请求字段。
export function products(options: { developer?: boolean } = {}): Product[] {
  const catalog = configuredProducts();
  return options.developer ? [...catalog, { id: DEVELOPER_TEST_PRODUCT_ID, name: "开发者测试支付", credits: 20, amountFen: 1, demo: process.env.FINDJOY_PAYMENTS_MODE !== "live" }] : catalog;
}
