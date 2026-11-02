import { currentUser } from "../../../../../lib/auth";
import { commerceStore } from "../../../../../lib/commerce-store";
import { lifeStore } from "../../../../../lib/life-store";
import { withApiGuard } from "../../../../../lib/api-request";
export const GET = withApiGuard(async (_request: Request, {params}: {params:Promise<{id:string}>}) => {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  await commerceStore.expireOperations();
  const op=await commerceStore.getOperation((await params).id,user.id);
  if(!op)return Response.json({error:"开局记录不存在"},{status:404});
  return Response.json({status:op.status, ...(op.status==="complete"?{state:await lifeStore.get(op.lifeId,user.id)}:{})}, {headers:{"Cache-Control":"no-store"}});
});
