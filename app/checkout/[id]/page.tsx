import { notFound,redirect } from "next/navigation";
import { AccountShell } from "../../../components/AccountShell";
import { Checkout } from "../../../components/Checkout";
import { currentUser } from "../../../lib/auth";
import { commerceStore } from "../../../lib/commerce-store";
import { publicOrder } from "../../../lib/payments";
export const metadata={title:"订单详情 · FindJoy 觅乐"};
export default async function OrderPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const user=await currentUser();
  if(!user)redirect(`/login?returnTo=${encodeURIComponent(`/findjoy/checkout/${id}`)}`);
  const order=commerceStore.getOrder(id,user.id);if(!order)notFound();
  return <AccountShell><Checkout initialOrder={publicOrder(order)}/></AccountShell>;
}
