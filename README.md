# Web to Obsidian

Capture web pages, selections, conversations, videos, or a drawn region as clean Markdown notes in a local Obsidian vault.

The extension runs entirely in the browser. It uses the File System Access API to read your vault, suggest folders and existing tags, edit YAML properties in the popup, and write notes directly to disk. There is no account, server, telemetry, or Obsidian URI workflow.

## Features

- Capture a selection, article, full page, supported conversation, or drawn region.
- Specialized extraction for common AI chats, YouTube, Reddit, Wikipedia, Medium, and more.
- Preserve headings, lists, links, images, tables, blockquotes, tasks, and code blocks.
- Configure multiple local vaults, each with its own destination folder and remembered properties.
- Edit YAML properties directly in the popup's **Properties** area, including arrays and links.
- Remember property settings independently for every vault.
- Properties added or edited for a note are remembered for the next note in that vault.
- Properties removed in the popup are removed from the remembered set and are not silently re-added later. Add them again in the popup when needed.
- The page title is used for the filename suggestion, not added as a default property.
- Suggest the next sequential filename: an existing `b2` leads to `b3`.
- Suggest existing vault tags and note links while editing properties.
- Preview and edit the complete Markdown note before saving.
- Keep per-vault rules in the extension and optionally sync them to a note in the vault.

## Install from source

1. Clone or download this repository.
2. Open `chrome://extensions` in Chrome, Brave, Edge, or another Chromium browser.
3. Enable **Developer mode**.
4. Select **Load unpacked** and choose this `web-to-obsidian` directory.
5. Pin the extension and open it on a page.

There is no build step. The only vendored dependency is Turndown under `lib/`.

## Configure a vault

1. Open the extension settings with the gear button or from the extension details page.
2. Select **Add vault**.
3. Enter the vault name and connect the vault's root folder. The folder name is checked against the vault name.
4. Set the default destination folder, such as `Sources`.
5. Save the vault.
6. Open a page, choose a capture mode, edit the properties directly in the popup, preview the note, and save it. The non-automatic properties are remembered for that vault.

The extension only writes to a folder after the browser grants read/write permission. If the destination folder does not exist yet, it is created when the first note is saved.

## Filename suggestions

Filenames start from the captured page title. After you save a numbered filename, the extension remembers that sequence for the selected vault and folder. The next time the popup opens it suggests the next number, such as `bit 1` → `bit 2` → `bit 3`. Existing files are also scanned so the sequence continues from the highest matching number.

The filename remains fully editable. Existing notes are never overwritten; a duplicate name receives a numeric suffix when saved.

## Capture modes

- **Selection**: save the text currently selected on the page.
- **Article**: extract the main article content.
- **Entire page**: capture the page body after removing common navigation and chrome.
- **Conversation**: available for supported AI chat sites.
- **Selected area**: draw a box around the part of the page to capture.

You can append your own notes before previewing or saving.

## Architecture

```text
Browser tab
  -> content extractor and site adapter
  -> popup conversion with Turndown and GFM
  -> editable YAML properties and Markdown preview
  -> File System Access API
  -> local Obsidian vault
```

The main modules are:

- `content/`: extraction, adapters, and drawn-region capture.
- `popup/`: capture controls, property editing, preview, and note saving.
- `options/`: local vault configuration.
- `shared/vault.js`: folder access, note writing, tag/link scans, property updates, and filename suggestions.
- `shared/yaml.js`: front matter parsing and serialization.
- `shared/storage.js`: local vault configuration and property presets.

## Privacy

- No account, analytics, telemetry, or remote backend.
- Captured content, vault contents, folder handles, properties, and rules stay on the device.
- Folder access is scoped by the browser to the vault folder you choose and can be revoked through browser extension permissions.

## Contributing

Load the directory unpacked while developing, then reload it from `chrome://extensions` after changes. Content-script changes also require refreshing the page being captured.

Useful contributions include new site adapters, extraction fixes, accessibility improvements, and focused bug reports with the affected site and capture mode.

## License

MIT. See [LICENSE](LICENSE).
