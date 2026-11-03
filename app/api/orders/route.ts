import { takeRateLimit } from "../../../lib/rate-limit";
import { currentUser, appOrigin } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/auth-policy";
import { commerceStore, CommerceError } from "../../../lib/commerce-store";
import { isDeveloper } from "../../../lib/developer";
import { products } from "../../../lib/products";
import { createPayment, publicOrder } from "../../../lib/payments";
import { readJsonObject, withApiGuard } from "../../../lib/api-request";

export const GET = withApiGuard(async () => {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  return Response.json({orders:(await commerceStore.listOrders(user.id)).map(publicOrder)},{headers:{"Cache-Control":"no-store"}});
});
export const POST = withApiGuard(async (request:Request) => {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  if(!(await takeRateLimit(user.id,"orders",10,60000)))return Response.json({error:"操作频繁，请稍后再试"},{status:429});
  if(!hasSameOrigin(request,appOrigin()))return Response.json({error:"请求来源无效"},{status:403});
  const body=await readJsonObject(request, 8 * 1024);
  if(body.channel!=="WECHAT_H5")return Response.json({error:"当前仅支持微信支付"},{status:400});
  try{
    const product=products({ developer: await isDeveloper(user) }).find(item=>item.id===body.productId);
    if(!product)return Response.json({error:"套餐不存在"},{status:400});
    const key=request.headers.get("Idempotency-Key") ?? "";
    const order=await commerceStore.createOrder(user.id,product,key,body.channel);
    try{
      return Response.json({order:publicOrder(await createPayment(order,request))},{headers:{"Cache-Control":"no-store"}});
    }catch{
      return Response.json({order:publicOrder(order),warning:"支付服务尚未确认，请在订单页查询或稍后重试。"},{status:202,headers:{"Cache-Control":"no-store"}});
    }
  }catch(error){
    if(error instanceof CommerceError)return Response.json({error:error.message,code:error.code},{status:error.status});
    return Response.json({error:"暂时无法创建订单"},{status:503});
  }
});
