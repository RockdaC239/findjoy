import { redirect } from "next/navigation";
import { AccountShell } from "../../components/AccountShell";
import { Checkout } from "../../components/Checkout";
import { currentUser } from "../../lib/auth";
import { isDeveloper } from "../../lib/developer";
import { products } from "../../lib/products";
export const metadata={title:"确认体验 · FindJoy 觅乐"};
export default async function CheckoutPage({searchParams}:{searchParams:Promise<{product?:string}>}){
  const params=await searchParams;
  const user = await currentUser();
  const product=products({ developer: await isDeveloper(user) }).find(item=>item.id===params.product);
  if(!product)redirect("/plans");
  if(!user)redirect(`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${product.id}`)}`);
  return <AccountShell><Checkout product={product}/></AccountShell>;
}
