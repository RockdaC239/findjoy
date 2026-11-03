import { notFound, redirect } from "next/navigation";
import { ReviewExperience } from "../../../components/ReviewExperience";
import { DEATH_CAUSE_LABEL } from "../../../lib/life";
import { currentUser } from "../../../lib/auth";
import { buildLifeView } from "../../../lib/life-view";
import { lifeStore } from "../../../lib/life-store";

export const metadata = { title: "人生回顾 | FindJoy" };

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?returnTo=${encodeURIComponent(`/findjoy/review/${id}`)}`);
  const state = await lifeStore.get(id, user.id);
  if (!state) notFound();
  if (!state.dead) redirect(`/play?life=${encodeURIComponent(id)}`);
  return <ReviewExperience lifeId={id} view={buildLifeView(state)} story={state.history.at(-1)?.outcome === "death" ? state.history.at(-1)?.story : undefined} cause={DEATH_CAUSE_LABEL[String(state.flags.deathCause)] ?? "离开了这个世界"} />;
}
