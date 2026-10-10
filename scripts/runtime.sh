#!/bin/zsh
# 只寻找已有运行环境；插件启动时不下载或安装软件。
SHELF_NODE=""
typeset -a shelf_node_candidates
shelf_node_candidates=(
  "${CODEX_MCP_NODE_PATH:-}"
  "${CODEX_ELECTRON_RESOURCES_PATH:-}/cua_node/bin/node"
  /Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node
  /Applications/Codex.app/Contents/Resources/cua_node/bin/node
  "$(command -v node)"
  /opt/homebrew/bin/node
  /usr/local/bin/node
)
for candidate in "${shelf_node_candidates[@]}"; do
  if [[ -x "$candidate" ]] && "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 18 ? 0 : 1)' >/dev/null 2>&1; then
    SHELF_NODE="$candidate"
    break
  fi
done
if [[ -z "$SHELF_NODE" ]]; then
  print -u2 '对话集需要 Node 18 或以上版本。请安装当前 Codex 桌面客户端，或安装 Node 后重试。 / ChatShelf requires Node 18 or later. Install the current Codex desktop app, or install Node and try again.'
  return 1
fi
