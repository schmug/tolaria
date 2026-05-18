# Mobile Strategy Assessment — Tolaria

> Status: research / decision-support. **Not an ADR.** Per AGENTS.md, the ADR
> gets created in the same commit as the code that implements the chosen path.
> This document exists to pick that path. Date: 2026-05-18.

## Question

What is the most efficient and maintainable way to ship a mobile Tolaria?
Preference order stated by the goal:

1. First-party Android **and** iOS
2. PWA
3. Mobile web only

## TL;DR recommendation

**Tauri 2 mobile (iOS + Android) is the recommended primary target — but only
because ADR-0085 already removed the blocker that would otherwise have made it
expensive.** The three options are not independent forks; they share ~80% of
the work. Sequence it as:

1. **Phase 0 — read-mostly Tauri mobile v1 on a non-git vault.** Low cost,
   ships first-party on both stores, no git engine required.
2. **Phase 1 — responsive/touch UI + cloud-folder sync UX.** The bulk of the
   real work; shared by *every* option below.
3. **Phase 2 — optional `isomorphic-git` for in-app history/sync** if mobile
   demand justifies it.

PWA is the *fallback* if Tauri 2 mobile plugin gaps prove intractable, not a
parallel track — and Phase 1 makes the PWA nearly free if we ever need it.

## Why the obvious "git is a critical blocker" framing is wrong

A surface reading says: git is shelled out to the `git` CLI
(`src-tauri/src/git/mod.rs:76-107`), no git binary exists on iOS/Android,
therefore mobile is blocked on integrating `isomorphic-git` — a large rewrite.

That was true under **ADR-0034** (git repo required, blocking modal). It is
**no longer true under ADR-0085** (active, 2026-04-26, supersedes 0034):

> "Open existing Markdown folders even when they are not Git repositories. A
> non-git vault is a supported state, not an error state… Git history, change,
> commit, sync, conflict, and remote actions are hidden or disabled."

A mobile vault is, by construction, a non-git vault: the device syncs the
Markdown folder through iCloud Drive / Files / Dropbox / SAF, and Tolaria
already has a fully-supported code path for exactly that — git UI hidden, scan
/ browse / edit / search working normally. **Mobile v1 needs zero git
engine.** This collapses the single largest cost the naive analysis assumes.

## Shared prerequisite work (required for *any* mobile path)

These are platform-independent. Doing them is doing most of "mobile,"
regardless of native vs PWA vs web:

| Workstream | What | Size | Notes |
|---|---|---|---|
| Responsive layout | Collapse the fixed 4-pane desktop layout (sidebar/list/editor/inspector, 480px min) into a stack/drawer for portrait | M | Only 1 responsive breakpoint exists today; no `useMediaQuery`. Biggest single chunk. |
| Touch UX | `onContextMenu` (63 sites) → long-press; hover-only affordances → tap; drag-resize → drawer | M | BlockNote/CodeMirror handle touch input natively (Prosemirror); needs validation + soft-keyboard handling, not a rewrite |
| Vault access | File-picker → app-scoped/security-scoped folder; settings storage off `~/.config` | M | iOS Files / Android SAF differ; both reachable via Tauri dialog plugin |
| AI agents | CLI-subprocess agents can't spawn on mobile; gate behind `#[cfg(desktop)]` (already partially done) or fall back to the Anthropic API path | S–M | Don't port CLI agents; API-only on mobile |
| Sync expectation | Document/UX that mobile sync = the user's cloud-folder provider, not in-app git | S | Aligns with ADR-0085's stated adoption path (Obsidian/iCloud/Dropbox folders) |

Everything above is React/Rust-guard work that lands on `main` for desktop
too (responsive layout and touch are pure wins on small desktop windows).

## Per-platform packaging comparison

Once the shared work exists, "which platform" is mostly a packaging decision:

### Tauri 2 mobile (recommended primary)

- **Stack reuse:** ~100%. Same React frontend, same Rust backend with existing
  `#[cfg(desktop)]`/`#[cfg(mobile)]` guards. ADR-0005 prototype already builds
  and runs on iPad simulator. iOS scaffolding exists at
  `src-tauri/gen/apple/`; Android (`gen/android/`) needs `tauri android init`.
- **Maturity (verified):** Tauri 2 mobile has had a **stable API since the
  2.0 GA (Oct 2024)** for both iOS and Android — ADR-0005's "iOS still beta"
  caveat is now stale. The real, current caveat is **plugin coverage**: not
  all desktop plugins are ported to mobile, and mobile-plugin docs lag.
  Tolaria's exposure here is small because the desktop-only plugins
  (updater, native menus, opener) are already feature-gated off mobile.
- **First-party stores:** yes, both App Store and Play Store. Satisfies the
  top-priority goal.
- **Cost:** Phase 0 (read-mostly, non-git) is genuinely small given the
  prototype + ADR-0085. Phase 1 shared work dominates.
- **Risk:** Tauri mobile plugin gaps; App Store review of a WebView-shell
  app (mitigated — Tauri ships as a normal native binary, not a web wrapper);
  must test on physical devices, not just simulators.

### PWA (recommended fallback, not a parallel track)

- **Stack reuse:** frontend yes; **the entire Rust backend is lost** — every
  filesystem and vault command would need a JS/`isomorphic-git` +
  File System Access API reimplementation. This is the *expensive* path, the
  opposite of the common assumption.
- **Value:** zero app-store friction, instant updates, one URL. Real if we
  want a no-install "try it on your phone" surface.
- **When to pick it:** only if Tauri 2 mobile plugin gaps block Phase 0/1.
  Phase 1's responsive/touch work makes a future PWA cheap to *shell*, but
  the backend-reimplementation cost remains and is why this is rank 2, not 1.

### Mobile web only

- Strictly the PWA frontend without offline/installability. Lowest
  capability, no local vault, no offline. Only as a marketing/demo surface
  (e.g., the existing `site/` docs already do read-only). Not a product
  answer to the goal; keep as rank 3 / explicitly out of scope for v1.

## Maintainability argument

The maintainability win is **one codebase, conditional compilation**, which
Tolaria already practices (`#[cfg(desktop)]`/`#[cfg(mobile)]`, 135 commands
already guarded). Tauri mobile keeps that invariant: no second frontend, no
Swift/Kotlin app to keep in sync, no divergent test suite. A PWA or native
rewrite (SwiftUI, rejected in ADR-0005) introduces a parallel implementation
that must be maintained against every future desktop feature — the dominant
long-term cost. The shared-prerequisite framing also means the responsive and
touch work is not "mobile tax": it improves the desktop product at narrow
window widths.

## Recommended sequence

1. **Phase 0 — Mobile v1 spike (Tauri, iOS + Android, non-git, read-mostly).**
   `tauri android init`; confirm the existing iOS prototype + non-git vault
   path on physical devices; vault via file picker into app-scoped storage;
   git/AI/menu surfaces hidden via existing guards. Deliverable: open a
   cloud-synced Markdown folder, browse, search, edit, save on both stores.
2. **Phase 1 — Responsive + touch + sync UX** (the shared prerequisite table).
   Lands on `main`, benefits desktop too.
3. **Phase 2 — Optional `isomorphic-git`** for in-app history/commit/sync on
   mobile, *only if* telemetry/demand justifies it. Until then, ADR-0085's
   non-git mode is the supported mobile sync story (provider-synced folder).

## Decisions to make before coding (open questions)

- **Android maturity gate:** spike `tauri android init` + a physical-device
  build before committing Phase 0 — Android plugin coverage is less battle-
  tested than iOS in Tolaria's context and is unproven here.
- **Vault access model per OS:** iOS security-scoped bookmarks vs Android SAF
  persisted-URI — different enough to need an ADR when implemented.
- **AI on mobile:** confirm API-key path (Anthropic SDK is already a
  dependency) is acceptable as the only mobile AI mode, or ship mobile with
  AI disabled in v1.
- **Editor on touch:** validate BlockNote + CodeMirror selection/soft-keyboard
  on real devices early — cheap to test, expensive to discover late.

## Non-goals / explicitly deferred

- SwiftUI / native rewrite — already rejected (ADR-0005); revisit only if
  mobile becomes the *primary* target.
- In-app git on mobile in v1 — deferred to Phase 2 behind demand.
- Mobile web (non-PWA) as a product — demo/docs surface only.

## Source ADRs and evidence

- ADR-0005 — Tauri v2 iOS for iPad (active): stack decision, isomorphic-git
  noted as the future git option, SwiftUI/Capacitor/RN rejected.
- ADR-0085 — Non-git vaults supported (active, supersedes ADR-0034): the
  keystone enabling a git-engine-free mobile v1.
- ADR-0034 — Git repo required (superseded by 0085): the now-removed blocker.
- `src-tauri/src/git/mod.rs:76-107` — git is CLI-subprocess only (no Rust git
  library), confirming why the *git-backed* path can't run on mobile.
- Tauri 2 mobile is GA/stable-API for iOS+Android since Oct 2024; the live
  caveat is desktop-plugin coverage, not core stability:
  [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/),
  [Mobile Plugin Development](https://v2.tauri.app/develop/plugins/develop-mobile/).

Sources:
- [Tauri 2.0 Stable Release](https://v2.tauri.app/blog/tauri-20/)
- [Mobile Plugin Development | Tauri](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [Develop | Tauri](https://v2.tauri.app/develop/)
