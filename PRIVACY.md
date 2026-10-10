# ChatShelf privacy and data

[简体中文](PRIVACY.zh-CN.md) · Developer: **pakco** · Version **0.9.6-beta.2**

## What is stored

ChatShelf stores the chats you choose to index on your Mac: conversation IDs, sources, titles, timestamps, optional last-message text or image previews, and your folders, projects, favorites, archive, trash, and undo history. The default directory is `~/Library/Application Support/ChatShelf/`. Release packages start with an empty index.

## How it is used

This data supports local search, organization, previews, backups, and opening original chats. The local service listens only on a loopback address. The plugin has no developer telemetry, advertising, or developer cloud storage. It does not read the client's internal databases, cookies, or login credentials.

When a Codex chat calls the host's chat-list, message-reading, or import tools, the relevant content enters the host's tool-processing workflow and is subject to the data policies of your client and account. This is not the same as offline processing. Downloading the package or dependencies connects to GitHub or npm. Opening an original chat hands the request to the corresponding client.

## Previews and connections

JSON files are parsed in the local interface. It submits only the index, a last-message preview of up to 180 characters, and embedded images within the size limits to the local service; it does not save the full conversation text. If an image pointer has no usable pixels, the interface shows “Image not synced.”

If the host allows a connection, the plugin may save a connection-session configuration on the local device, readable only by the current user. It is excluded from chat backups and release packages and should not be shared. Background sync and native ChatGPT navigation are not connected in this beta.

## Retention and your controls

The index does not expire automatically. Trash is a recoverable local organization state: it neither deletes chats on their original platform nor permanently clears the index. Uninstalling the plugin does not automatically delete your data. You can export a backup and then delete the local data directory yourself; restoring it afterward depends on the backup you kept.

Before posting feedback, remove private titles, content, and identifiers. Do not upload real backups or connection files. Report issues through [GitHub Issues](https://github.com/pakco77/chat-shelf/issues).
