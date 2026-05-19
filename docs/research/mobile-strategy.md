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

---

## Android viability spike — outcome (2026-05-18)

> Resolves the **"Android maturity gate"** open question and Issue #3. Scope:
> stand up a Tauri 2 Android build and run it **locally on the macOS Android
> emulator** (not a physical device — the goal explicitly asked for emulator
> testing on this Mac). This is the Android half of the Phase 0 gate; on-device
> physical testing and the Phase 0 vault feature loop remain follow-ups.

### Recommendation: **GO** ✅

A Tauri 2 Android debug build compiles, installs, and runs on the emulator.
The React frontend renders, the WebView is interactive (touch input
registers), and the Rust↔JS IPC works (the Sentry-consent dialog is driven by
a Rust `get_settings` round-trip). No native crash; process stays alive. The
Android plugin-coverage risk the strategy flagged did **not** materialize for
Tolaria — the desktop-only plugins are already registration-gated off mobile,
and the only real blockers were cross-compilation issues, all fixed with
small, desktop-neutral changes.

### Reproduce locally (macOS, Apple Silicon)

- Toolchain: `tauri-cli 2.10.0` (via `pnpm tauri`), Rust 1.93, NDK
  `28.2.13676358`, JDK 21 (Temurin), Android SDK at `~/Library/Android/sdk`.
- `rustup target add aarch64-linux-android` (emulator on Apple Silicon is
  native arm64; the other Android targets were added by `tauri android init`).
- Env: `ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME` (`/usr/libexec/java_home -v
  21`), and `platform-tools`/`emulator` on `PATH`.
- `pnpm tauri android init` → generates `src-tauri/gen/android/` (committed,
  same convention as `gen/apple/`; `build/` is git-ignored by the generated
  `.gitignore`).
- `pnpm tauri android build --debug --target aarch64` → produces
  `gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk`.
- AVD: `system-images;android-35;google_apis_playstore;arm64-v8a`; install with
  `adb install -r`, launch `club.refactoring.tolaria/.MainActivity`.
- Generated Android levels: `minSdk 24`, `compileSdk`/`targetSdk 36`.

### Cross-compilation blockers found and fixed

| Blocker | Root cause | Fix (desktop-neutral) |
|---|---|---|
| `openssl-sys` fails to cross-compile for `aarch64-linux-android` | `sentry`'s default `transport` feature pulls `reqwest` with `native-tls`; Cargo feature-unifies that onto our otherwise-rustls `reqwest` | Declared `sentry` per-target in `Cargo.toml`: desktop keeps the default (native-tls); mobile uses `default-features=false` + `rustls`. Verified `openssl-sys` is gone from the Android tree and desktop sentry is unchanged. |
| `AiAgentsStatus` / `AiAgentStreamRequest` not in scope (mobile) | `use crate::ai_agents::{...}` was `#[cfg(desktop)]` but the `#[cfg(mobile)]` command stubs reference those types | Made that single `use` unconditional (types are defined unconditionally; used by both paths) |
| `get_ai_agents_status` mobile stub missing `kiro` field | `kiro` agent (PR #572) added to `AiAgentsStatus` after the mobile stub was written | Added the `kiro: AiAgentAvailability` initializer to the mobile stub |
| `sync_vault_asset_scope` not found (mobile) in `reload_vault` | `crate::sync_vault_asset_scope` is `#[cfg(desktop)]`; `scan_cmds.rs` called it unguarded (other call sites in `file_cmds.rs` already guarded) | Applied the existing `#[cfg(desktop)]` / `#[cfg(not(desktop))]` guard pattern at the call site |
| Desktop-only window methods (`show`/`center`/`set_focus`/`unminimize`) compiled on mobile | `show_debug_main_window` was gated only on `debug_assertions`, not `desktop` | Re-gated to `#[cfg(all(desktop, debug_assertions))]` with a `not(...)` no-op (only ever called from the already-`#[cfg(desktop)]` setup path) |

### Runtime blocker found and fixed (post-build)

The build succeeding is **not** sufficient — the first `tauri android dev`
run crashed on launch with `SIGABRT`. The spike's earlier "verification" only
proved the pre-Sentry-init React shell rendered in a screenshot; it never
exercised any code path that builds a `reqwest::Client`. Closing that
verification gap surfaced this:

| Blocker | Root cause | Fix (desktop-neutral) |
|---|---|---|
| App aborts (`SIGABRT`) ~7 s after launch on Android. Tombstone: non-unwinding Rust panic at `reqwest-0.13.2/src/async_impl/client.rs:2461`, propagating through `Java_..._RustWebViewClient_handleRequest` (panic cannot unwind across the JNI `extern` boundary → abort). | `tauri-plugin-updater` is linked (not registered) on mobile; its default `rustls-tls` feature selects reqwest's `rustls-no-provider`. rustls 0.23 then has no process-default `CryptoProvider`, so the first reqwest client build panics. Nothing on mobile installs a provider (desktop gets one transitively via the native-tls/other path). | Install the `ring` provider as the first statement of `run()`, gated `#[cfg(mobile)]`: `let _ = rustls::crypto::ring::default_provider().install_default();` (first-wins, non-fatal if already installed). Added `rustls = { version = "0.23", default-features = false, features = ["ring","std"] }` to the mobile target block so the API is reachable; `ring` is already the unified rustls provider feature via reqwest 0.12's `rustls-tls`. Desktop dep graph unchanged. Verified: app stays alive 60 s+ across runs (same PID), through the Sentry-consent → `sentry::init` → reqwest path, with zero `panicked`/`SIGABRT`/`FATAL` in `logcat`. |
| App launches and stays up but is **stuck on the consent dialog / "unclickable"**. Console: `Failed to load/save settings: Could not determine config directory`. | Two duplicate `app_config_dir()` impls (`settings.rs`, `vault_list.rs`) called `dirs::config_dir()`, which is `None` on Android/iOS → every settings/vault-list read/write failed, so the consent dialog could never persist and never advanced. | **ADR-0123.** Seed the Tauri app-scoped config dir (`app.path().app_config_dir()`) into a `OnceLock` at the top of `setup_app` (before any settings read); `settings::app_config_dir()` is now `#[cfg(mobile)]`-branched (mobile = seeded dir, desktop = `dirs::config_dir()` unchanged). `vault_list.rs` now reuses `settings::app_config_dir` (de-duplicated). Verified: no settings errors in `logcat`; consent dialog dismisses and the app advances to vault onboarding. |
| Dev WebView reloads constantly during `tauri android|ios dev`; app never settles, feels uninteractive. | The vite dev-server watcher ignored `src-tauri/target/**` but **not** `src-tauri/gen/**`, where the Gradle/Xcode build continuously writes (reports, symlinked `.so`, jniLibs). Every native build write triggered a full WebView page reload. | Added `**/src-tauri/gen/**` to `devServerWatchIgnored` in `vite.config.ts` (symmetric with the existing `target/**` ignore). Verified: writing the exact `gen/android/build/...` path that previously force-reloaded no longer triggers a reload. |

### Plugin / feature viability matrix (Android, emulator)

| Capability | Status | Notes |
|---|---|---|
| `tauri-plugin-log` | **works** | Registered for all targets; `RustStdoutStderr` visible in `logcat` |
| `tauri-plugin-dialog` | **compiles + registered** | Registered on mobile via `setup_common_plugins`; Tauri documents Android support. The folder-picker → SAF flow itself is **not yet exercised** (Phase 0, Issue #2) |
| Rust ↔ JS IPC / `invoke` | **works** | Settings round-trip drives the consent dialog; WebView renders the React app |
| App config / settings storage | **works (ADR-0123)** | `dirs::config_dir()` is `None` on Android, so `settings.rs`/`vault_list.rs` failed every read/write and the app was stuck on the consent dialog. Now seeded from the Tauri app-scoped config dir at `setup_app`. Consent flow completes and the app advances to vault onboarding. |
| Touch input | **works (synthesized: focus-then-activate)** | Real taps register and change focus; an `adb shell input tap` on a WebView button focuses it but may need an explicit activate (e.g. `keyevent 66`) — adb-synthesized touch quirk, not a defect in app touch handling. Real on-device touch validation remains Issue #4/#5. |
| `protocol-asset` | **degraded/untested** | Asset-scope sync is correctly no-op'd on mobile (`#[cfg(not(desktop))]`); actual `asset:`-served images in a vault not yet validated |
| `tauri-plugin-updater` | **linked, not registered** | Registration is `#[cfg(desktop)]` and the `#[cfg(mobile)]` command stubs return "not available", but the crate is still **compiled/linked** on mobile. Its default `rustls-tls` feature selects reqwest's `rustls-no-provider`, which **crashed the app on launch** until a process-default rustls `CryptoProvider` was installed — see the runtime-blocker note below. |
| `tauri-plugin-process` | **absent by design** | Desktop-only registration; not needed on mobile |
| `tauri-plugin-opener` | **absent on mobile** | Registered only in `setup_desktop_plugins`; not core for Phase 0 |
| `tauri-plugin-prevent-default` | **absent by design** | macOS-desktop-only (`#[cfg(all(desktop, target_os = "macos"))]`) |
| CLI AI agents | **absent by design** | All `#[cfg(desktop)]`; mobile stubs return "not available" — matches the AI-on-mobile decision still open in Issue #5 |
| `notify` vault watcher | **stubbed (expected)** | Mobile relies on manual refresh, per the strategy doc |

### Not covered by this spike (remains open)

- **Physical-device** Android run (Issue #2/#3 acceptance for hardware parity).
- Phase 0 feature loop on Android: SAF folder pick → persist across restart →
  browse → search → edit → save (Issue #2, Android half).
- Per-OS vault-access ADR (Issue #5) — to be drafted with the Phase 0
  vault-access code, not here (no path change ⇒ no ADR for this spike).
- `asset:` image rendering and `tauri-plugin-dialog` SAF picker exercised
  end-to-end on Android.
