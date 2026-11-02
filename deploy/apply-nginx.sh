#!/usr/bin/env bash
# 只在校验通过后重载，失败恢复原文件；不启动或切换应用。
set -euo pipefail
candidate="${1:?candidate config required}"
active="${2:?active config required}"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
had_previous=0
if sudo test -f "$active"; then
  sudo cat "$active" > "$work/previous"
  had_previous=1
  if cmp -s "$candidate" "$work/previous"; then sudo nginx -t; exit 0; fi
fi
restore_previous() {
  if [ "$had_previous" = 1 ]; then
    sudo tee "$active" < "$work/previous" >/dev/null
  else
    sudo rm -f "$active"
  fi
}
if ! sudo tee "$active" < "$candidate" >/dev/null; then
  restore_previous
  exit 1
fi
if ! sudo nginx -t; then
  restore_previous
  exit 1
fi
if ! sudo systemctl reload nginx; then
  restore_previous
  if sudo nginx -t; then sudo systemctl reload nginx || true; fi
  exit 1
fi
