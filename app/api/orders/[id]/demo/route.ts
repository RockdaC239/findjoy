import { currentUser,appOrigin } from "../../../../../lib/auth";
import { hasSameOrigin } from "../../../../../lib/auth-policy";
import { commerceStore } from "../../../../../lib/commerce-store";
import { withApiGuard } from "../../../../../lib/api-request";
export const POST = withApiGuard(async (request:Request,{params}:{params:Promise<{id:string}>}) => {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  if(!hasSameOrigin(request,appOrigin()))return Response.json({error:"请求来源无效"},{status:403});
  const order=await commerceStore.getOrder((await params).id,user.id);
  if(!order || !order.demo)return Response.json({error:"演示订单不存在"},{status:404});
  await commerceStore.confirmDemo(order.id,user.id);
  return Response.json({success:true});
});
