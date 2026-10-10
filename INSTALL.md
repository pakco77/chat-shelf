# Install ChatShelf (对话集)

[简体中文](INSTALL.zh-CN.md) · Version **0.9.6-beta.2**

## 30-second quick start

For a Mac with a **Codex desktop app that supports plugins**. This is a quick guide; downloading the package and importing your first chats may take longer.

1. [Download the complete macOS ZIP](https://github.com/pakco77/chat-shelf/releases/download/v0.9.6-beta.2/chat-shelf-0.9.6-beta.2-macos.zip).
2. Unzip it and keep the whole folder somewhere permanent, such as Documents.
3. Double-click **Install.command**. When the installer prints **Installation complete**, return to Codex.
4. Start a **new Codex chat** and send:

   > Open ChatShelf (对话集) and import the chat titles currently visible to your tools.

Your imported chats appear in **Inbox**. Open a chat's preview and use **Move to** to place it in a folder or project. To add previews, ask: “Please import the last visible message previews for these chats.”

The complete package includes the plugin's dependencies. The installer first looks for the Node runtime and Codex command-line program provided by the desktop app. If no compatible Node is available, it asks you to install Node 18 or later; it does not silently download a runtime. Keep the extracted folder because it remains the registered installation source.

ChatShelf is free. Your host client's account and usage terms still apply. Installation needs no administrator privileges, does not close the client, and preserves original chats and existing ChatShelf data. The plugin does not ask for a model API key.

## If double-clicking does not open the installer

Give the extracted folder to Codex and ask:

> Read this folder's README.md and INSTALL.md, inspect Install.command, then run the local installer. Preserve existing data and report the installation result.

You can also open Terminal, type `zsh ` with a trailing space, drag **Install.command** into the window, and press Return. This uses the system's interpreter to run the downloaded script; removing macOS security attributes is unnecessary.

## If the shelf is still empty

- The package starts with an empty index. It includes no developer chat history.
- The current Codex chat needs access to the host's chat-list tool to import visible titles. Its scope may cover only part of your history.
- If that tool is unavailable, choose **More → Import chats** and select your own ChatGPT `conversations.json` export or an index JSON file.
- **Sync disconnected** does not prevent manual import, organization, or native opening of Codex chats on macOS. Background sync and native ChatGPT navigation are not connected in this beta.
- If the plugin is missing after installation, start a new chat first. Quit and reopen the client if needed.

For Codex chats, **Sent to the desktop client** means macOS accepted the request. Loading the original chat is handled by the client and requires access to that record.

## Installation messages

| Message | What to do |
| --- | --- |
| Codex client not found | Install and open the desktop app. For a custom app location, ask Codex to help with installation. |
| Node 18 or later required | Update the client, or install a supported Node LTS release and retry. |
| npm required for the source package | Use the complete macOS ZIP from the release page instead of GitHub's automatically generated Source code ZIP. |
| Runtime dependencies incomplete | Download the complete package again, unzip it, and rerun the installer. |
| Plugin installed but not enabled | Enable 对话集 in the client's plugin settings. |

When reporting an error, share the message and reproduction steps. Remove private details, and do not upload chat backups or connection-session files.

## Install from source

Developers need Node 18+, npm, and a compatible Codex desktop client:

```sh
git clone https://github.com/pakco77/chat-shelf.git
cd chat-shelf
npm ci --ignore-scripts
zsh Install.command
```

If dependencies are missing, the explicit installation step runs `npm ci` with lifecycle scripts disabled. Normal plugin startup does not download dependencies.

## Update or uninstall

Before updating, choose **More → Save backup**. Unzip the new complete package and run its installer. The plugin version updates while your data directory remains intact. Keep the new extracted folder.

Uninstall or disable ChatShelf in the client's plugin settings. The default data directory, `~/Library/Application Support/ChatShelf/`, is retained so a later installation can use it again. To remove your local data, confirm you have a backup before deleting that directory yourself.

Read [Privacy and data](PRIVACY.md) for what the plugin stores and how host tools handle imported content.
