import { appOrigin, currentUser } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/auth-policy";
import { validDisplayName } from "../../../lib/account-profile";
import { identityStore } from "../../../lib/identity-store";
import { commerceStore } from "../../../lib/commerce-store";
export async function GET() {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  commerceStore.expireOperations();
  return Response.json({user,balance:commerceStore.balance(user.id),ledger:commerceStore.ledger(user.id)},{headers:{"Cache-Control":"no-store"}});
}

export async function PATCH(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return Response.json({ error: "请求来源无效" }, { status: 403 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: "请求格式无效" }, { status: 400 }); }
  if (!validDisplayName(body?.displayName)) return Response.json({ error: "昵称需为 1–80 个字符，且不能包含换行或控制字符" }, { status: 400 });
  identityStore.updateDisplayName(user.id, body.displayName);
  return Response.json({ displayName: body.displayName.trim() }, { headers: { "Cache-Control": "no-store" } });
}
