"use client";
import { useEffect, useRef } from "react";
import type { LifeView } from "../lib/life-view";
import type { StreamedEvent } from "../lib/stream-event";
import { CHILDHOOD_BOUNDARY } from "../lib/engine/phase";

export function LifeEventScene({ life, isLoading, streamingEvent, onChoose, onContinue, onExit }: {
  life: LifeView; isLoading: boolean; streamingEvent: StreamedEvent;
  onChoose: (id: string) => void; onContinue: () => void; onExit: () => void;
}) {
  const title = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (life.experienceVersion === 3 && !isLoading) title.current?.focus({ preventScroll: true });
  }, [life.eventId, life.experienceVersion, isLoading]);
  return (
      <section className="life-event" aria-labelledby="event-title" aria-busy={isLoading}>
        <div className="event-story">
          <div className="event-body" aria-live="polite">
            {(isLoading ? streamingEvent.story : life.story).split("\n\n").filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {isLoading && !streamingEvent.story && <span className="story-cursor" aria-label="正在生成" />}
          </div>
          <p className="event-tagline" id="event-title" ref={title} tabIndex={-1}>
            {(() => {
              const title = isLoading ? streamingEvent.title : life.eventTitle;
              return title ? `“${title}”` : "";
            })()}
          </p>
        </div>
        <div className="decision-area" aria-label="人生决策" hidden={isLoading && streamingEvent.outcome === "death"}>
          {life.experienceVersion !== 3 && life.age < CHILDHOOD_BOUNDARY ? (
            <>
              <p className="decision-label">命运在继续。</p>
              <div className="choice-cards">
                {[0, 1, 2].map((index) => (
                  <div className="choice-card choice-card--placeholder" key={index} aria-hidden="true">
                    <span className="choice-card-back">?</span>
                  </div>
                ))}
              </div>
              <button className="continue-button" onClick={onContinue} disabled={isLoading}>
                {isLoading ? "命运正在展开…" : "继续"}
              </button>
            </>
          ) : (
            <>
              <p className="decision-label">做出你的选择。</p>
              <div className="choice-cards">
                {(life.experienceVersion === 3 ? life.choices.map(choice => choice.id) : ["A", "B", "C"]).map((id, index) => {
                  const choice = isLoading ? streamingEvent.choices[index] : life.choices[index];
                  return (
                    <button className={`choice-card ${choice ? "choice-card--revealed" : ""}`} key={id} disabled={!choice || isLoading} onClick={() => choice && onChoose(choice.id)}>
                      <span className="choice-card-back" aria-hidden="true">?</span>
                      <span className="choice-card-front"><small>{choice?.id ?? id}</small><strong>{`“${choice?.text ?? ""}”`}</strong><b aria-hidden="true">↗</b></span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button className="rebirth-button" onClick={() => onExit()} type="button">重生</button>
        </div>
      </section>
  );
}
