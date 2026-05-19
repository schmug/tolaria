# 0123. Mobile App Config Storage

Status: active

Date: 2026-05-19

## Context

Tolaria persists `settings.json` (and related app config) under a directory
resolved by `settings::app_config_dir()`, which called
`dirs::config_dir()`. On desktop that returns the platform config dir
(`~/.config`, `~/Library/Application Support`, `%APPDATA%`). On Android and iOS
`dirs::config_dir()` returns `None`, so every settings read and write failed
with "Could not determine config directory".

This surfaced during the Phase 0 Android emulator bring-up (see
`docs/research/mobile-strategy.md`): the app launched and rendered, but the
first settings-backed screen — the telemetry-consent dialog — could never
persist a choice, so it never dismissed. The app looked "frozen / unclickable"
when in fact every click was firing a settings write that the backend
rejected. The mobile-strategy doc and Issue #5 already flagged "app settings
storage off the desktop `~/.config` path on mobile" as a decision needing an
ADR; this records it.

## Decision

**On mobile, app config is stored in the Tauri-resolved app-scoped config
directory; desktop behavior is unchanged.**

`setup_app` resolves `app.path().app_config_dir()` (Android: app-internal
storage, no runtime permission needed; iOS: app sandbox) once at startup,
before anything reads settings, and seeds it into the settings module via a
`OnceLock` (`set_mobile_app_config_dir`). `app_config_dir()` is now
`#[cfg(mobile)]`-branched: mobile returns the seeded app-scoped path; desktop
keeps `dirs::config_dir()` exactly as before. The existing
`APP_CONFIG_DIR` / legacy-path joining and `create_dir_all` logic is reused
unchanged on top of the resolved base.

## Options considered

- **Option A (chosen): Seed the Tauri path-resolver app config dir into a
  startup `OnceLock`, branch `app_config_dir()` by `cfg(mobile)`.** Minimal,
  desktop-neutral, reuses all existing path logic, no new dependency, and the
  free-function settings API stays unchanged for its many callers.
- **Option B: Thread an `AppHandle` through every settings call.** Correct but
  invasive — settings is reached from many non-command paths without a handle;
  large churn for no behavioral gain over A.
- **Option C: Hardcode an Android path (e.g. `/data/data/<pkg>/files`).**
  Fragile, wrong on iOS, and duplicates what the Tauri path resolver already
  computes correctly per-platform.

## Consequences

Mobile builds can read and write settings, so the consent dialog and every
settings-backed screen work. Desktop is untouched (`dirs::config_dir()` path
preserved; `cfg(not(mobile))` branch identical to prior behavior).

The mobile config dir must be seeded before the first settings access; this is
guaranteed by setting it at the top of `setup_app`, before
`telemetry::init_sentry_from_settings()` and before the WebView loads. If a
future code path reads settings earlier than `setup_app`, it must seed or
tolerate an uninitialized mobile dir (the getter returns a clear error rather
than panicking).

Mobile config lives in app-scoped storage, so uninstalling the app clears it
(expected mobile behavior); there is no migration from a desktop-style path
because none existed on mobile. Per-OS *vault* access (distinct from app
config) remains open in Issue #5 and is not decided here.
