import { notFound, redirect } from "next/navigation";
import { AccountShell } from "../../components/AccountShell";
import { AdminDashboard } from "../../components/AdminDashboard";
import { currentUser } from "../../lib/auth";
import { isDeveloper } from "../../lib/developer";

export const metadata = {
  title: "后台 · FindJoy 觅乐",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent("/findjoy/admin")}`);
  if (!await isDeveloper(user)) notFound();
  return <AccountShell showRecharge={false}>
    <main className="profile-main"><AdminDashboard /></main>
  </AccountShell>;
}
