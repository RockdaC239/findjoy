import {currentUser,appOrigin} from "../../../../../lib/auth";
import {hasSameOrigin} from "../../../../../lib/auth-policy";
import {commerceStore} from "../../../../../lib/commerce-store";
import {createPayment,publicOrder} from "../../../../../lib/payments";
import {takeRateLimit} from "../../../../../lib/rate-limit";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return Response.json({error:"请先登录"},{status:401});
 if(!hasSameOrigin(request,appOrigin()))return Response.json({error:"请求来源无效"},{status:403});
 if(!takeRateLimit(user.id,"payment-retry",5,60000))return Response.json({error:"请稍后再试"},{status:429});
 const order=commerceStore.getOrder((await params).id,user.id);if(!order)return Response.json({error:"订单不存在"},{status:404});
 try{return Response.json({order:publicOrder(await createPayment(order,request))});}
 catch{return Response.json({order:publicOrder(order),warning:"支付结果尚未确认，请稍后查询，勿重复付款。"},{status:202});}
}
