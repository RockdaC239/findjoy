import { processPaymentWebhook } from "../../../../lib/payments";
export async function POST(request:Request) {
  if(Number(request.headers.get("content-length"))>65536)return new Response("too large",{status:413});
  const raw=new Uint8Array(await request.arrayBuffer());
  if(raw.byteLength>65536)return new Response("too large",{status:413});
  try{await processPaymentWebhook(request.headers,raw);return new Response("success");}
  catch{return new Response("notification not processed",{status:400});}
}
