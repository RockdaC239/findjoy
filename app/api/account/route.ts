import { currentUser } from "../../../lib/auth";
import { commerceStore } from "../../../lib/commerce-store";
export async function GET() {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  commerceStore.expireOperations();
  return Response.json({user,balance:commerceStore.balance(user.id),ledger:commerceStore.ledger(user.id)},{headers:{"Cache-Control":"no-store"}});
}
