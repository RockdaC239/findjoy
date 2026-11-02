import { notFound, redirect } from "next/navigation";
import { ReviewView } from "../../../components/ReviewView";
import { currentUser } from "../../../lib/auth";
import { buildLifeView } from "../../../lib/life-view";
import { lifeStore } from "../../../lib/life-store";

export const metadata = { title: "人生回顾 | FindJoy" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/findjoy/review/${id}`)}`);
  const state = lifeStore.get(id, user.id);
  if (!state) notFound();
  if (!state.dead) redirect(`/play?life=${encodeURIComponent(id)}`);
  return <ReviewView lifeId={id} view={buildLifeView(state)} />;
}
