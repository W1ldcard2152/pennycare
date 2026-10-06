# Changelog

## [Unreleased]

### Added
- Form 941 and NYS-45 are editable. Every line can be changed to match the return actually filed (e.g. NY's online calculator); totals recalculate, any total can be overridden, edits can be saved as a draft, and the PDF reflects the edits.
- Filing a 941 or NYS-45 now updates the books to the filed return: one adjusting entry, dated the last day of the quarter, brings each payroll-tax liability account to the filed figure, with the difference in a new 6020 Payroll Tax Adjustments account. The payment can be recorded in the same dialog. Re-filing, unfiling or voiding a filing voids its adjusting entry (Approver role).

### Fixed
- Tax deposit auto-fill attributed payments to the quarter they were *made* in rather than the quarter they *pay for*. Because deposits usually land in the following quarter, the earlier quarter kept showing a balance due after it was paid and the current quarter showed less (often nothing) due. Balances are now each quarter's payroll tax less the deposits recorded for that quarter.
- The deposit form shows what each recent quarter owes and defaults to the oldest quarter still owed. A deposit recorded under the wrong quarter can be corrected with **Change quarter** on the Tax Deposits list.
- The Tax Liability page labelled the current quarter as the previous one in US time zones (Q3 showed as "Q2"), counted voided and corrected payroll, and guessed the federal deposit schedule from the period's total instead of using the schedule set in Settings.
- Default dates on the deposit, NYS-1 and filing forms rolled over to the next day after 8pm Eastern.
- NYS-45 line 15 counted every NY withholding payment for the quarter, including payments made with the NYS-45 itself; it now counts only NYS-1 payments.

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
