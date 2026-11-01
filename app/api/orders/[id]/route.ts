import { takeRateLimit } from "../../../../lib/rate-limit";
import { currentUser } from "../../../../lib/auth";
import { commerceStore } from "../../../../lib/commerce-store";
import { publicOrder,queryPayment } from "../../../../lib/payments";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  if(!takeRateLimit(user.id,"order-query",30,60000))return Response.json({error:"操作频繁，请稍后再试"},{status:429});
  const order=commerceStore.getOrder((await params).id,user.id);
  if(!order)return Response.json({error:"订单不存在"},{status:404});
  try{return Response.json({order:publicOrder(await queryPayment(order))},{headers:{"Cache-Control":"no-store"}});}
  catch{return Response.json({order:publicOrder(order),warning:"暂未取得最新支付结果，请稍后查询。"},{headers:{"Cache-Control":"no-store"}});}
}
