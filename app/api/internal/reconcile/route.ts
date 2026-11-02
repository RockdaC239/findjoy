import {timingSafeEqual} from "node:crypto";
import {commerceStore} from "../../../../lib/commerce-store";
import {queryPayment} from "../../../../lib/payments";
export async function POST(request:Request){
 const secret=process.env.FINDJOY_RECONCILE_TOKEN??"";
 const supplied=request.headers.get("authorization")??"";
 const expected=`Bearer ${secret}`;
 if(secret.length<32 || Buffer.byteLength(supplied)!==Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:"Unauthorized"},{status:401});
 await commerceStore.expireOperations();
 const orders=await commerceStore.outstandingOrders();let checked=0,unconfirmed=0;
 for(const order of orders){try{await queryPayment(order);checked++;}catch{unconfirmed++;}}
 return Response.json({checked,unconfirmed},{headers:{"Cache-Control":"no-store"}});
}
