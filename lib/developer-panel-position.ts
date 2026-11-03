export function developerPanelPosition(anchor: { left: number; top: number; bottom: number }, panel: { width: number; height: number }, viewport: { width: number; height: number }) {
  const below = Math.max(0, viewport.height - Math.max(16, anchor.bottom + 8) - 16);
  const above = Math.max(0, anchor.top - 8 - 16);
  const placeBelow = below >= panel.height || below >= above;
  const maxHeight = placeBelow ? below : above;
  return {
    left: Math.max(16, Math.min(anchor.left, viewport.width - panel.width - 16)),
    top: placeBelow ? Math.max(16, anchor.bottom + 8) : Math.max(16, anchor.top - 8 - Math.min(panel.height, maxHeight)),
    maxHeight,
  };
}
