#!/bin/zsh
SHELF_INSTALL_ROOT="$(cd "$(dirname "$0")" && pwd)"
if source "$SHELF_INSTALL_ROOT/scripts/runtime.sh"; then
  "$SHELF_NODE" "$SHELF_INSTALL_ROOT/scripts/install.mjs" "$@"
  SHELF_INSTALL_RESULT=$?
else
  SHELF_INSTALL_RESULT=1
fi
if [[ -t 0 ]]; then read -r '?按回车关闭此窗口。'; fi
exit "$SHELF_INSTALL_RESULT"
