import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AccountShell } from "../../components/AccountShell";
import { Checkout } from "../../components/Checkout";
import { currentUser } from "../../lib/auth";
import { hasDeveloperAccess } from "../../lib/developer";
import { products } from "../../lib/products";
export const metadata={title:"确认体验 · FindJoy 觅乐"};
export default async function CheckoutPage({searchParams}:{searchParams:Promise<{product?:string}>}){
  const params=await searchParams;
  const user = await currentUser();
  const developer=await hasDeveloperAccess(user, user?(await cookies()).toString():null);
  const product=products({ developer }).find(item=>item.id===params.product);
  if(!product)redirect("/plans");
  if(!user)redirect(`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${product.id}`)}`);
  return <AccountShell><Checkout product={product}/></AccountShell>;
}
