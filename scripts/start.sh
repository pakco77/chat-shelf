#!/bin/zsh
# 使用宿主或本机已有 Node；不下载软件、不读取聊天正文。
SHELF_PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$SHELF_PLUGIN_ROOT/scripts/runtime.sh" || exit 1
cd "$SHELF_PLUGIN_ROOT" || exit 1
if ! "$SHELF_NODE" --input-type=module -e 'await import("@modelcontextprotocol/sdk/server/mcp.js"); await import("zod")' >/dev/null 2>&1; then
  print -u2 '对话集的运行依赖不完整。请重新运行下载包中的 Install.command；源码用户可在目录中运行 npm ci 后再安装。 / ChatShelf runtime dependencies are incomplete. Run Install.command from the downloaded package again. Source users can run npm ci in the source folder, then reinstall.'
  exit 1
fi
if [[ "${1:-}" == --check ]]; then exit 0; fi
exec "$SHELF_NODE" "$SHELF_PLUGIN_ROOT/server.mjs" --stdio
