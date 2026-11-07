"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import type { LifeView } from "../lib/life-view";
import { Farewell } from "./Farewell";
import { ReviewView } from "./ReviewView";
import { NarrationScene } from "./NarrationScene";
import { readLifeScene, rememberLifeScene } from "../lib/life-session";
import styles from "./Farewell.module.css";

function subscribeToScene(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function ReviewExperience({ lifeId, view, story, cause }: {
  lifeId: string; view: LifeView; story?: string; cause: string;
}) {
  const modern = view.experienceVersion === 3;
  const savedScene = useSyncExternalStore(subscribeToScene,
    () => modern && view.eventId ? readLifeScene(lifeId, view.eventId) : null, () => null);
  const [sceneOverride, setScene] = useState<"farewell" | "review" | null>(null);
  const scene = sceneOverride ?? (savedScene === "farewell" || savedScene === "review" ? savedScene : modern ? "narration" : "farewell");
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const showReview = useCallback(() => {
    if (modern && view.eventId) rememberLifeScene(lifeId, view.eventId, "review");
    setScene("review");
  }, [modern, lifeId, view.eventId]);
  const status = useCallback((value: { ready: boolean; error: string }) => { setReady(value.ready); setError(value.error); }, []);
  return <>
    {scene === "narration" && <main className={styles.farewell}><NarrationScene
      story={view.narration ?? ""} ready continueLabel="走向告别" homeHref="/"
      onContinue={() => {
        if (view.eventId) rememberLifeScene(lifeId, view.eventId, "farewell");
        setScene("farewell");
        window.scrollTo({ top: 0, behavior: "instant" });
      }}
    /></main>}
    {scene === "farewell" && <Farewell age={view.age} story={modern ? "这一生，停在了这里。" : story} cause={cause} ready={ready} error={error} onContinue={showReview} onRetry={() => { setReady(false); setError(""); setAttempt(value => value + 1); }} />}
    <div hidden={scene !== "review"} inert={scene !== "review"}>
      <ReviewView key={`${lifeId}:${attempt}`} lifeId={lifeId} view={view} onStatus={status} />
    </div>
  </>;
}
