"use client";

import { useState, type FormEvent } from "react";
import type { LifeView } from "../lib/life-view";
import { LIFE_MODES, SCRIPT_ERAS, THEMES, scriptsForEra } from "../lib/modes/catalog";
import { getScenarioLabel, validateForuBrief } from "../lib/modes/scenario";
import type { ForuBrief, LifeMode, StartSelection, ThemeId } from "../lib/modes/types";

interface ModeLauncherProps {
  disabled: boolean;
  resumableLife: LifeView | null;
  isResuming: boolean;
  onStart: (selection: StartSelection) => void;
  onResume: () => void;
}

const DEFAULT_FORU: ForuBrief = {
  age: 0,
  city: "",
  occupation: "",
  family: "",
  relationship: "unspecified",
  economy: "ordinary",
  health: "ordinary",
  housing: "unspecified",
  situation: "",
  focus: "",
};

const RELATIONSHIP_OPTIONS: Array<{ value: ForuBrief["relationship"]; label: string }> = [
  { value: "single", label: "单身" },
  { value: "dating", label: "恋爱中" },
  { value: "married", label: "已婚" },
  { value: "divorced", label: "离异" },
  { value: "widowed", label: "丧偶" },
  { value: "complicated", label: "关系复杂" },
  { value: "unspecified", label: "暂不填写" },
];

const ECONOMY_OPTIONS: Array<{ value: ForuBrief["economy"]; label: string }> = [
  { value: "tight", label: "拮据" },
  { value: "ordinary", label: "普通" },
  { value: "comfortable", label: "宽裕" },
];

const HEALTH_OPTIONS: Array<{ value: ForuBrief["health"]; label: string }> = [
  { value: "good", label: "良好" },
  { value: "ordinary", label: "一般" },
  { value: "fragile", label: "较弱" },
];

const HOUSING_OPTIONS: Array<{ value: ForuBrief["housing"]; label: string }> = [
  { value: "with_family", label: "与家人同住" },
  { value: "rent", label: "租住" },
  { value: "own", label: "自有住房" },
  { value: "unspecified", label: "暂不填写" },
];

export function ModeLauncher({ disabled, resumableLife, isResuming, onStart, onResume }: ModeLauncherProps) {
  const [mode, setMode] = useState<LifeMode>("normal");
  const [theme, setTheme] = useState<ThemeId>("love");
  const [eraId, setEraId] = useState(SCRIPT_ERAS[0].id);
  const [scriptId, setScriptId] = useState(scriptsForEra(SCRIPT_ERAS[0].id)[0]?.id ?? "");
  const [foru, setForu] = useState<ForuBrief>(DEFAULT_FORU);
  const [foruError, setForuError] = useState("");

  const currentMode = LIFE_MODES.find((item) => item.id === mode) ?? LIFE_MODES[0];
  const scripts = scriptsForEra(eraId);
  const selectedScript = scripts.find((script) => script.id === scriptId) ?? scripts[0];
  const selectedTheme = THEMES.find((item) => item.id === theme) ?? THEMES[0];

  function selectMode(next: LifeMode) {
    setMode(next);
    setForuError("");
  }

  function selectEra(nextEraId: string) {
    setEraId(nextEraId);
    const first = scriptsForEra(nextEraId)[0];
    if (first) setScriptId(first.id);
  }

  function updateForu<K extends keyof ForuBrief>(key: K, value: ForuBrief[K]) {
    setForu((previous) => ({ ...previous, [key]: value }));
    setForuError("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    if (mode === "normal") {
      onStart({ mode: "normal" });
      return;
    }
    if (mode === "theme") {
      onStart({ mode: "theme", theme });
      return;
    }
    if (mode === "script") {
      if (!selectedScript) {
        setForuError("这个剧本暂时不可用，请换一个。");
        return;
      }
      onStart({ mode: "script", scriptId: selectedScript.id });
      return;
    }
    const validated = validateForuBrief(foru);
    if (!validated.ok) {
      setForuError(validated.error);
      return;
    }
    onStart({ mode: "foru", brief: validated.brief });
  }

  const cta = mode === "normal"
    ? "开始普通人生"
    : mode === "theme"
      ? `开始${selectedTheme.label}人生`
      : mode === "script"
        ? "进入这个剧本"
        : "生成我的 ForU 人生";

  const note = mode === "normal"
    ? "从 0 岁开始，出身随机。"
    : mode === "theme"
      ? "从 0 岁开始，主题贯穿一生。"
      : mode === "script"
        ? "第一幕从剧本年龄开始，不再从出生写起。"
        : "第一幕从你现在的年龄开始。";

  return (
    <section className="mode-launcher" aria-labelledby="mode-heading">
      <div className="mode-section-head">
        <p className="mode-kicker" id="mode-heading">选择一种玩法</p>
        <span className="mode-section-note">同一套人生引擎 · 不提供幸福分数</span>
      </div>

      <div className="mode-grid" role="group" aria-label="玩法模式">
        {LIFE_MODES.map((definition) => {
          const comingSoon = definition.id === "theme" || definition.id === "foru";
          return (
            <button
              key={definition.id}
              type="button"
              className="mode-card"
              disabled={comingSoon}
              title={comingSoon ? "开发中，敬请期待" : undefined}
              aria-pressed={mode === definition.id}
              data-mode={definition.id}
              onClick={() => selectMode(definition.id)}
            >
              <span className="mode-card-eyebrow">{definition.eyebrow}</span>
              <span className="mode-card-title-row">
                <strong>{definition.label}</strong>
                {definition.badge ? <span className="mode-card-badge">{definition.badge}</span> : null}
              </span>
              <span className="mode-card-tagline">{comingSoon ? "开发中，敬请期待" : definition.tagline}</span>
            </button>
          );
        })}
      </div>

      {resumableLife ? (
        <div className="mode-resume">
          <div className="mode-resume-copy">
            <span className="mode-resume-label">上次的人生还在</span>
            <p>
              {resumableLife.age} 岁 · {resumableLife.city || "未记录城市"} · {getScenarioLabel(resumableLife.scenario).label}
            </p>
          </div>
          <button type="button" className="resume-button" disabled={disabled || isResuming} onClick={onResume}>
            {isResuming ? "正在接上…" : "继续上次"}
          </button>
        </div>
      ) : null}

      <form className="mode-panel" onSubmit={handleSubmit}>
        <div className="mode-panel-head">
          <div>
            <p className="mode-panel-eyebrow">{currentMode.eyebrow}</p>
            <h2>{currentMode.label}</h2>
          </div>
          <p className="mode-panel-description">{currentMode.description}</p>
        </div>

        {mode === "normal" ? (
          <div className="mode-note">
            <p>系统会随机生成家庭经济、家庭结构与开局事件基调，并避开你最近几局用过的出身。</p>
            <div className="mode-chips">
              <span>从 0 岁开始</span>
              <span>没有预设主线</span>
              <span>完整一生</span>
            </div>
          </div>
        ) : null}

        {mode === "theme" ? (
          <div>
            <div className="theme-grid" role="group" aria-label="选择主题">
              {THEMES.map((definition) => (
                <button
                  key={definition.id}
                  type="button"
                  className="theme-card"
                  aria-pressed={theme === definition.id}
                  onClick={() => setTheme(definition.id)}
                >
                  <span className="mode-card-eyebrow">{definition.eyebrow}</span>
                  <strong>{definition.label}</strong>
                  <span className="theme-card-tagline">{definition.tagline}</span>
                  <span className="theme-card-focus">{definition.focus.join(" · ")}</span>
                </button>
              ))}
            </div>
            <p className="mode-hint">主题会定期把主线拉回来，也会让其他题材作为背景出现。它不提供额外分数，也不改变结局的评价方式。</p>
          </div>
        ) : null}

        {mode === "script" ? (
          <div>
            <div className="era-tabs" role="group" aria-label="选择年代">
              {SCRIPT_ERAS.map((era) => (
                <button
                  key={era.id}
                  type="button"
                  className="era-tab"
                  aria-pressed={eraId === era.id}
                  onClick={() => selectEra(era.id)}
                >
                  {era.label}
                </button>
              ))}
            </div>
            <div className="script-grid" role="group" aria-label="选择剧本">
              {scripts.map((script) => (
                <button
                  key={script.id}
                  type="button"
                  className="script-card"
                  aria-pressed={selectedScript?.id === script.id}
                  onClick={() => setScriptId(script.id)}
                >
                  <span className="script-card-meta">{script.start.age} 岁 · {script.start.city}</span>
                  <strong>{script.title}</strong>
                  <span>{script.tagline}</span>
                </button>
              ))}
            </div>
            {selectedScript ? (
              <div className="script-detail">
                <p className="mode-panel-eyebrow">开场钩子</p>
                <p>{selectedScript.hook}</p>
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "foru" ? (
          <div>
            <div className="foru-form">
              <div className="foru-field">
                <label htmlFor="foru-age">年龄 <span>必填</span></label>
                <input
                  id="foru-age"
                  type="number"
                  inputMode="numeric"
                  min={16}
                  max={90}
                  value={foru.age || ""}
                  placeholder="例如 29"
                  onChange={(event) => updateForu("age", Number.parseInt(event.target.value, 10) || 0)}
                />
              </div>
              <div className="foru-field">
                <label htmlFor="foru-city">城市</label>
                <input
                  id="foru-city"
                  value={foru.city}
                  maxLength={40}
                  placeholder="例如 上海"
                  onChange={(event) => updateForu("city", event.target.value)}
                />
              </div>
              <div className="foru-field">
                <label htmlFor="foru-occupation">现在的身份 / 工作</label>
                <input
                  id="foru-occupation"
                  value={foru.occupation}
                  maxLength={60}
                  placeholder="例如 产品经理、学生、自由职业"
                  onChange={(event) => updateForu("occupation", event.target.value)}
                />
              </div>
              <div className="foru-field">
                <label htmlFor="foru-relationship">关系状态</label>
                <select
                  id="foru-relationship"
                  value={foru.relationship}
                  onChange={(event) => updateForu("relationship", event.target.value as ForuBrief["relationship"])}
                >
                  {RELATIONSHIP_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="foru-field">
                <label htmlFor="foru-economy">经济状况</label>
                <select
                  id="foru-economy"
                  value={foru.economy}
                  onChange={(event) => updateForu("economy", event.target.value as ForuBrief["economy"])}
                >
                  {ECONOMY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="foru-field">
                <label htmlFor="foru-health">身体状况</label>
                <select
                  id="foru-health"
                  value={foru.health}
                  onChange={(event) => updateForu("health", event.target.value as ForuBrief["health"])}
                >
                  {HEALTH_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="foru-field">
                <label htmlFor="foru-housing">居住</label>
                <select
                  id="foru-housing"
                  value={foru.housing}
                  onChange={(event) => updateForu("housing", event.target.value as ForuBrief["housing"])}
                >
                  {HOUSING_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </div>
              <div className="foru-field foru-field--full">
                <label htmlFor="foru-family">家庭 / 关系补充 <span>可选</span></label>
                <input
                  id="foru-family"
                  value={foru.family}
                  maxLength={240}
                  placeholder="例如 和伴侣租房，父母在外地"
                  onChange={(event) => updateForu("family", event.target.value)}
                />
              </div>
              <div className="foru-field foru-field--full">
                <label htmlFor="foru-situation">你现在最真实的处境 <span>必填</span></label>
                <textarea
                  id="foru-situation"
                  value={foru.situation}
                  maxLength={1200}
                  placeholder="例如：工作稳定但最近公司在裁员，我在考虑要不要回老家。伴侣想留下，我却越来越不确定。"
                  onChange={(event) => updateForu("situation", event.target.value)}
                />
                <span className="foru-counter">{foru.situation.length}/1200</span>
              </div>
              <div className="foru-field foru-field--full">
                <label htmlFor="foru-focus">希望重点探索的方向 <span>可选</span></label>
                <textarea
                  id="foru-focus"
                  value={foru.focus}
                  maxLength={300}
                  placeholder="例如：我想知道，如果留下来，五年后的我会怎么看待今天。"
                  onChange={(event) => updateForu("focus", event.target.value)}
                />
                <span className="foru-counter">{foru.focus.length}/300</span>
              </div>
            </div>
            {foruError ? <p className="mode-error" role="alert">{foruError}</p> : null}
            <p className="foru-privacy">这些内容会保存在本机的人生数据库，并发送给你配置的模型服务用于生成本局推演。请不要填写身份证号、住址等敏感信息。</p>
          </div>
        ) : null}

        <div className="mode-start-row">
          <p className="mode-start-note">{note}</p>
          <button type="submit" className="primary-button" disabled={disabled}>
            <span>{cta}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>
    </section>
  );
}
