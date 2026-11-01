import { takeRateLimit } from "../../../lib/rate-limit";
import { currentUser, appOrigin } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/auth-policy";
import { commerceStore, CommerceError } from "../../../lib/commerce-store";
import { products } from "../../../lib/products";
import { createPayment, publicOrder } from "../../../lib/payments";

export async function GET() {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  return Response.json({orders:commerceStore.listOrders(user.id).map(publicOrder)},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request) {
  const user=await currentUser();
  if(!user)return Response.json({error:"请先登录"},{status:401});
  if(!takeRateLimit(user.id,"orders",10,60000))return Response.json({error:"操作频繁，请稍后再试"},{status:429});
  if(!hasSameOrigin(request,appOrigin()))return Response.json({error:"请求来源无效"},{status:403});
  const body=await request.json().catch(()=>null);
  if(!body || typeof body!=="object" || !["ALIPAY_H5","WECHAT_H5"].includes(body.channel))return Response.json({error:"请选择支付方式"},{status:400});
  try{
    const product=products().find(item=>item.id===body.productId);
    if(!product)return Response.json({error:"套餐不存在"},{status:400});
    const key=request.headers.get("Idempotency-Key") ?? "";
    const order=commerceStore.createOrder(user.id,product,key,body.channel);
    try{
      return Response.json({order:publicOrder(await createPayment(order,request))},{headers:{"Cache-Control":"no-store"}});
    }catch{
      return Response.json({order:publicOrder(order),warning:"支付服务尚未确认，请在订单页查询或稍后重试。"},{status:202,headers:{"Cache-Control":"no-store"}});
    }
  }catch(error){
    if(error instanceof CommerceError)return Response.json({error:error.message,code:error.code},{status:error.status});
    return Response.json({error:"暂时无法创建订单"},{status:503});
  }
}
