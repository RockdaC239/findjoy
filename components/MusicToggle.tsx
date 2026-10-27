"use client";

interface MusicToggleProps {
  enabled: boolean;
  supported: boolean;
  onToggle: () => void;
  compact?: boolean;
}

export function MusicToggle({ enabled, supported, onToggle, compact = false }: MusicToggleProps) {
  const label = !supported ? "当前浏览器不支持背景音乐" : enabled ? "关闭背景音乐" : "开启背景音乐";
  return (
    <button
      type="button"
      className={`music-toggle${compact ? " music-toggle--compact" : ""}`}
      aria-pressed={enabled && supported}
      aria-label={label}
      title={label}
      disabled={!supported}
      data-on={enabled && supported ? "true" : "false"}
      onClick={onToggle}
    >
      <svg className="music-toggle-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M4 9v6h3.2L12 19V5L7.2 9H4Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        {enabled ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M18.2 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : (
          <path d="m15.5 9 5 6m0-6-5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        )}
      </svg>
      <span className="music-toggle-label">音乐</span>
      <span className="music-toggle-state" aria-hidden="true">{supported ? (enabled ? "开" : "关") : "—"}</span>
    </button>
  );
}
