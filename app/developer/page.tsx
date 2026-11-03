import { notFound, redirect } from "next/navigation";
import { currentUser } from "../../lib/auth";
import { isDeveloper } from "../../lib/developer";
import { commerceStore } from "../../lib/commerce-store";
import { DeveloperTools } from "../../components/DeveloperTools";
export const metadata = { title: "个人调试 · FindJoy" };
export default async function DeveloperPage() {
  const user = await currentUser();
  if (!user) redirect("/login?returnTo=%2Ffindjoy%2Fdeveloper");
  if (!await isDeveloper(user)) notFound();
  return <DeveloperTools initialBalance={(await commerceStore.balance(user.id)).available} />;
}
