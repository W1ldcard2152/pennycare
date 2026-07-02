# Changelog

## [1.1.1] — 2026-07-01

### Fixed
- Payroll pay-period week selector could shift by a day depending on the time of day the app was launched. The Sunday–Saturday week was computed with local-time weekday math but then serialized/displayed in UTC, so launching in the evening (past ~8pm US Eastern, when the local clock has crossed into the next UTC day) rolled the whole period forward a day — the "dates change every time I restart" symptom. Week boundaries are now anchored to noon UTC of the local calendar day and all math is done in UTC, so the selected pay period is stable regardless of launch time or timezone. The same fix was applied to the payroll register and time-tracking week selectors. No stored payroll data was affected — this was a selection/display bug only.

## [1.1.0] — 2026-06-06

### Added
- Multi-window support (Shift+click any internal link opens a new window).
- Browser-style tab system for the desktop app...
- (etc.)

### Changed
- ...

### Fixed
- ...

## [1.0.0] — 2025-XX-XX
- First stable build.
