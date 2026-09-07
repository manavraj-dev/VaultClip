# Web → Obsidian

**Capture anything on the web, straight into your Obsidian vault — using *your* templates, *your* folders, and *your* properties.**

Web → Obsidian is a Chromium browser extension that turns any page (or selection, or a box you draw around part of a page, or an AI chat, or a YouTube video, or a Reddit thread) into a clean Markdown note, formatted exactly the way you already format notes in Obsidian. It reads your real templates, lets you fill in the properties before anything is saved, and writes the finished `.md` file directly into your vault. No server, no account, no clipboard gymnastics.

> **Obsidian stays the source of truth.** This extension doesn't try to be a second brain — it's the layer that gets web content *into* the one you already have.

---

## Why this instead of a generic web clipper

Most clippers dump a page into an inbox folder as raw HTML-flavored Markdown and call it done. Web → Obsidian is built around the actual way people use Obsidian:

- **Multiple vaults, multiple workflows.** Configure "Personal Knowledge," "University," and "Programming" as separate vault entries, each with its own template folder and default destination. There's no separate project name to keep in sync — each entry *is* identified by its Obsidian vault name.
- **Your templates, not a copy of them.** The extension reads the `.md` template files already in your vault's `Templates/` folder and shows them as options — you never re-build a template inside the extension, and it never silently rewrites your originals.
- **Properties you can actually see and edit.** A template's YAML front matter becomes an editable field list before you save, with a few sensible fields (`source`, `captured`, `title`, `tags`) auto-filled in for you — and the tags field autocompletes from tags you already use elsewhere in the vault.
- **A real preview.** What you see before hitting Save is exactly the Markdown that gets written — front matter included — and it's editable right there.
- **Specialized adapters for messy sites.** ChatGPT, Claude, Gemini, Copilot, Perplexity, Poe, Le Chat, Grok, DeepSeek, HuggingChat, You.com, Meta AI, YouTube, Reddit, Wikipedia, and Medium each get extraction logic tuned to their DOM — and any *other* AI chat site is picked up automatically by a generic detector, instead of fighting generic heuristics against a chat UI.
- **Not stuck with the whole page.** Draw a translucent box around just the part of a page you care about — a chart with its caption, one comment thread, a pricing table — and only that gets pulled in.
- **A place to keep your own conventions.** Each vault has a "Vault rules" note describing what your tags/folders/properties mean, so tagging stays consistent even months later (or for anyone else you share the vault with).

## How it saves into your vault

Two methods, configured per vault:

| Method | How it works | What you get |
|---|---|---|
| **Local folder** (recommended) | Uses the browser's File System Access API to hold a direct handle to your vault folder | Reads your real templates, lists your real folders, autocompletes real tags, writes the note straight to disk — no dialogs after the first time you grant access |
| **Obsidian URI** | Builds an `obsidian://new` link and opens it | Works with zero filesystem permissions, using templates (and a manually-listed set of tags) you define once inside the extension's settings |

Both paths produce the same result: a real `.md` file in your vault, in the right folder, with the right front matter.

## Features

- **No separate project name — vaults are identified purely by their Obsidian vault name.** One less thing to name, and one less thing that can drift out of sync with the actual vault.
- **Folder/vault-name mismatch check.** When you connect a local folder, the extension compares the folder's actual name to the vault name you typed. Obsidian identifies a vault by its folder name, so if they don't match, you'll see an inline warning (with a one-click "use this name instead" fix) before you can save with a mismatch unnoticed.
- **A Terms & Conditions gate on first use.** The very first time you open the popup or the settings page, you're asked to read and accept the extension's terms before anything else is shown; this is remembered afterward (see [Terms & Conditions](#terms--conditions) below for what it covers).
- Capture modes: **selection**, **main article**, **entire page**, **an area you draw on the page**, and (on supported sites) **full conversation**
- **Draw-a-box capture** — click "Draw a box on the page…," drag a translucent purple rectangle over whatever you want (an image with its caption, a single comment, a pricing table, part of a long article), and only the content under that box is pulled in as Markdown. Press Esc any time to cancel, or Redraw before confirming.
- **Add your own content** — an "✎ Add your own content" toggle in the popup reveals a notes box; anything you type there is appended to the captured note (below a `---` divider) before it's saved, so you can drop in your own commentary, a summary, or follow-up questions without leaving the page.
- **Automatic AI-chat detection** — named adapters for ChatGPT, Claude, Gemini, Copilot, Perplexity, Poe, Le Chat, Grok, DeepSeek, HuggingChat, You.com, and Meta AI unlock a "Conversation" capture mode that keeps turns separated and labeled (`### You` / `### ChatGPT`, etc.). Any other AI chat site is auto-detected by a generic pattern matcher (looking for repeated message-turn structures in the DOM), so new or lesser-known assistants still get proper conversation capture instead of being run through generic article/page extraction.
- **Tag autocomplete from your vault** — clicking into the `tags` property field in the popup scans your vault's existing notes for every tag already in use and offers them as suggestions, so you don't fragment your tag taxonomy with near-duplicate spellings. (For the Obsidian URI method, which can't read the vault, you list your common tags once in Settings instead.)
- **Vault rules page** — a free-form "Vault rules" note per vault (edited in Settings, viewable from a "Vault rules" link in the popup) for writing down what each tag/folder/property means in that vault — e.g. `#reading` vs `#reference`, or which folder a given template belongs in. For the local-folder method it can also be synced to (and loaded back from) a real note inside the vault itself, so it lives alongside your other notes.
- Strips navigation, ads, cookie banners, and other page chrome automatically
- Preserves headings, lists, links, images, tables, blockquotes, and code blocks through a proper HTML → Markdown pipeline (Turndown + GFM tables/strikethrough/task lists)
- Multiple named **vaults**, each with its own template folder and default folder
- Live template picker that mirrors your Obsidian `Templates/` folder
- Editable YAML/properties panel (strings, numbers, booleans, dates, tags/lists)
- Folder picker populated from your actual vault structure
- Filename auto-suggested from the page title, sanitized for filesystem safety, fully editable
- Full Markdown preview (with front matter) before anything is written
- Right-click **"Save selection to Obsidian"** / **"Save page to Obsidian"** / **"Draw an area to save to Obsidian…"** context menus
- 100% local: no account, no telemetry, no third-party server in the request path

## Install (from source, until this hits the Chrome Web Store)

1. Clone or download this repo.
2. Open `chrome://extensions` (or the equivalent in Brave/Edge/any Chromium browser).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the `web-to-obsidian` folder.
5. Pin the extension, then click its icon on any page to open the popup.
6. The first time you open the popup (or the settings page), you'll be asked to accept the [Terms & Conditions](#terms--conditions) before you can do anything else — read them and check the box to continue.

## Setting up your first vault

1. Click the extension icon → the gear icon (or right-click the icon → **Options**).
2. Click **+ Add vault**.
3. Enter the **Obsidian vault name** exactly as it appears in Obsidian — this is the only name you set; there's no separate project name.
4. Pick a **save method**:
   - **Local folder** — click **Connect vault folder…** and select your Obsidian vault's root folder in the picker. If the folder you pick doesn't share the same name as what you typed into "Obsidian vault name," you'll see an inline warning asking you to double-check (with a button to auto-fix it to match the folder). Then set the template folder path (e.g. `Templates`) and a default destination folder (e.g. `Sources`).
   - **Obsidian URI** — add one or more templates (name, properties, and an optional body with a `{{content}}` placeholder for where the captured Markdown should go), and optionally list the tags you use most often.
5. (Optional but recommended) Fill in **Vault rules** — a few lines on what your tags/folders/properties mean in this vault. If you're on the local-folder method, you can also sync this to a real note in the vault with **Save to vault** / **Load from vault**.
6. Click **Save vault**.
7. Open any page, click the extension icon, choose a capture mode (including "Draw a box on the page…" if you only want part of it), pick the vault and template, tweak the properties and filename — tags autocomplete from your vault as you type — hit **Preview** to double-check, add any of your own notes with **✎ Add your own content**, then **Save to Obsidian**.

## Capturing just part of a page

Click **▭ Draw a box on the page…** in the popup. The popup closes and a translucent overlay appears on the page: drag to draw a box around whatever you want, then click **Use this area** in the small toolbar that appears (or **Redraw** to try again, or **Esc** to cancel). The extension re-opens itself (or badges the toolbar icon if your browser doesn't allow that) with the captured content already loaded as a "Selected area" capture — properties, filename, and template still work exactly as normal from there.

## Terms & Conditions

The first time you open the popup, or the settings page, you'll see a full-screen Terms & Conditions notice that you must read and accept (by checking a box and clicking "I Agree") before the rest of the extension becomes usable — declining closes the popup/tab without unlocking anything. Acceptance is remembered locally (it's just a flag in the browser's local extension storage) so you won't see it again unless the terms are updated in a way that requires re-acceptance.

The terms are standard boilerplate for a free, local-only browser tool: they clarify what the extension does and doesn't do (no accounts, no servers, nothing sent anywhere), put responsibility for chosen content/folders/backups on the user, disclaim warranties given how often site DOMs change, and cap liability. The full text lives in `shared/terms.js` (`ObsidianTerms.TEXT`) and is rendered as-is in both the popup and the options page — edit it there if you fork this project and want your own wording.

## Architecture

```
Extension opens (popup or settings)
    │
    ▼
Terms & Conditions gate (first run only — blocks everything until accepted)
    │
    ▼
Browser tab
    │
    ▼
Content script  ──▶  Generic extractor  ──▶  Site adapter (named, or auto-detected AI chat)
    │                                              │
    │                                    Area-select overlay (draw-a-box capture)
    ▼
Popup: Turndown (HTML → Markdown) ──▶ optional "Add your own content" notes appended
    │
    ▼
Template engine (reads Obsidian template, merges {{content}})
    │
    ▼
YAML/properties editor (tags autocomplete from vault scan / known-tags list)
    │
    ▼
Vault bridge ──▶ File System Access API (checks folder name vs. vault name, writes .md directly, reads/writes Vault rules note)
             └─▶ obsidian://new URI (fallback, no folder access needed)
    │
    ▼
Obsidian vault
```

Everything above the vault bridge runs in the browser; nothing is sent to a remote server.

## Adding a new site adapter

Adapters live in `content/adapters.js` and are just an entry in the `ADAPTERS` map keyed by hostname:

```js
'example.com': {
  name: 'Example',
  extractArticle() {
    const el = document.querySelector('.the-real-content');
    if (!el) return null;
    const clone = ObsidianExtractor.cleanClone(el);
    return { title: ObsidianExtractor.getPageTitle(), html: clone.innerHTML };
  },
}
```

Return `null` to fall back to the generic extractor. Chat-style sites can also implement `extractConversation()` and set `supportsConversation: true` to unlock the "Conversation" capture mode — or, for a quick two-role chat adapter, use the `turnRoleAdapter(name, selector, isUserFn)` helper already in `adapters.js`. Note that unlisted AI chat sites are also covered automatically by the generic detector in `genericAIChatAdapter()`, so a dedicated adapter is only worth adding when the generic one doesn't extract cleanly. PRs adding adapters for other sites are very welcome — see [Contributing](#contributing).

## Privacy

- No account, no sign-up, no analytics.
- Captured content, templates, vault paths, and vault rules never leave your machine — there's no backend for this extension to talk to.
- The **Local folder** method uses Chrome's File System Access API; the permission is scoped to the single folder you pick and can be revoked any time from Chrome's site/extension settings.
- The **draw-a-box** capture reads the page's own DOM (the same page content you can already see and select), not a screen/pixel capture — nothing is sent anywhere as an image.
- Terms & Conditions acceptance is stored as a single local flag (`chrome.storage.local`) — it's not tied to any account or identity and isn't sent anywhere either.

## Roadmap

- [ ] Firefox support (File System Access API isn't there yet, so this will likely lean on the Obsidian URI/native-messaging path)
- [ ] Optional native companion app for batch export, attachment/image downloading, and richer Templater-style template processing
- [ ] More adapters (Twitter/X, Substack, arXiv, GitHub issues/PRs, Hacker News threads)
- [ ] Highlight-to-annotate capture (grab multiple non-contiguous selections in one note)
- [ ] Multiple draw-a-box regions combined into a single note
- [ ] Chrome Web Store listing

Have an idea or a site you want supported? Open an issue.

## Contributing

Contributions are very welcome, especially:
- New site adapters
- Bug reports with a URL and what went wrong
- Improvements to the generic extraction heuristics (including the generic AI-chat detector and the area-select element picker)

To work on it locally: load the extension unpacked as above, then reload it from `chrome://extensions` after each change (`content/` script changes also need a page refresh to re-inject). No build step is required — the only vendored dependency is Turndown, already committed under `lib/`.

If you find this useful, **starring the repo** genuinely helps other Obsidian users find it.

## License

MIT — see [LICENSE](LICENSE).
