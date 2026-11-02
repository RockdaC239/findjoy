#!/usr/bin/env bash
# 原子切换/回退 current 软链，并清理旧发布目录。
# 只操作 SERVER_PATH 下的 current 与 releases，不启动或停止服务。
set -euo pipefail

action="${1:?action required}"
server_path="${2:?server path required}"
current="${server_path}/current"
releases="${server_path}/releases"

resolve_current() {
  if [ -e "$current" ]; then
    (cd "$current" && pwd -P)
  fi
}

switch_to() {
  target="${1:?target required}"
  [ -d "$target" ] || { echo "release directory missing" >&2; exit 1; }
  # 兼容首次切换前 current 是真实目录的旧布局：先移走，不能直接覆盖目录。
  if [ -e "$current" ] && [ ! -L "$current" ]; then
    mv "$current" "${current}.legacy-$(date +%s)"
  fi
  # ln -n 不跟随目标软链，直接替换 current；Linux 与 macOS 行为一致。
  ln -sfn "$target" "$current"
}

prune_releases() {
  keep="${1:-3}"
  case "$keep" in (*[!0-9]*|'') echo "keep must be a positive integer" >&2; exit 1;; esac
  [ "$keep" -ge 1 ] || { echo "keep must be a positive integer" >&2; exit 1; }
  [ -d "$releases" ] || return 0
  releases=$(cd "$releases" && pwd -P)
  active=$(resolve_current || true)
  index=0
  # 按修改时间从新到旧；保留最近 keep 个以及当前正在使用的目录。
  for raw in $(ls -1dt "$releases"/*/ 2>/dev/null); do
    dir=$(cd "${raw%/}" && pwd -P)
    index=$((index + 1))
    if [ "$dir" = "$active" ] || [ "$index" -le "$keep" ]; then continue; fi
    case "$dir" in
      "$releases"/*) rm -rf -- "$dir"; echo "removed old release: $(basename "$dir")";;
    esac
  done
}

case "$action" in
  resolve) resolve_current;;
  switch) switch_to "${3:-}";;
  rollback) switch_to "${3:-}";;
  prune) prune_releases "${3:-3}";;
  *) echo "unknown action: $action" >&2; exit 1;;
esac
