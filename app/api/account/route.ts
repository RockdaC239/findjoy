import { appOrigin, currentUser } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/auth-policy";
import { validDisplayName } from "../../../lib/account-profile";
import { identityStore } from "../../../lib/identity-store";
import { commerceStore } from "../../../lib/commerce-store";
import { readJsonObject, withApiGuard } from "../../../lib/api-request";
export const GET = withApiGuard(async () => {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  await commerceStore.expireOperations();
  return Response.json({user,balance:await commerceStore.balance(user.id),ledger:await commerceStore.ledger(user.id)},{headers:{"Cache-Control":"no-store"}});
});

export const PATCH = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return Response.json({ error: "请求来源无效" }, { status: 403 });
  const body = await readJsonObject(request, 8 * 1024);
  if (!validDisplayName(body.displayName)) return Response.json({ error: "昵称需为 1–80 个字符，且不能包含换行或控制字符" }, { status: 400 });
  await identityStore.updateDisplayName(user.id, body.displayName);
  return Response.json({ displayName: body.displayName.trim() }, { headers: { "Cache-Control": "no-store" } });
});
