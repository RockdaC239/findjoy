"use client";

import { useCallback, useState } from "react";
import type { LifeView } from "../lib/life-view";
import { Farewell } from "./Farewell";
import { ReviewView } from "./ReviewView";

export function ReviewExperience({ lifeId, view, story, cause }: {
  lifeId: string; view: LifeView; story?: string; cause: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const showReview = useCallback(() => setRevealed(true), []);
  const status = useCallback((value: { ready: boolean; error: string }) => { setReady(value.ready); setError(value.error); }, []);
  return <>
    {!revealed && <Farewell age={view.age} story={story} cause={cause} ready={ready} error={error} onContinue={showReview} onRetry={() => { setReady(false); setError(""); setAttempt(value => value + 1); }} />}
    <div hidden={!revealed} inert={!revealed}>
      <ReviewView key={`${lifeId}:${attempt}`} lifeId={lifeId} view={view} onStatus={status} />
    </div>
  </>;
}
