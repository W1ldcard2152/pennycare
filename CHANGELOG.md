# Changelog

## [Unreleased]

### Added
- Form 941 and NYS-45 are editable. Every line can be changed to match the return actually filed (e.g. NY's online calculator); totals recalculate, any total can be overridden, edits can be saved as a draft, and the PDF reflects the edits.
- Filing a 941 or NYS-45 now updates the books to the filed return: one adjusting entry, dated the last day of the quarter, brings each payroll-tax liability account to the filed figure, with the difference in a new 6020 Payroll Tax Adjustments account. The payment can be recorded in the same dialog. Re-filing, unfiling or voiding a filing voids its adjusting entry (Approver role).
- Tax Settings takes the full 2020-and-later Form W-4: the Step 2 multiple-jobs checkbox, Step 3 dependents, and Step 4(a) other income / 4(b) deductions. Allowances only show for a pre-2020 W-4.
- NY Re-employment Service Fund (RSF) is booked with each payroll (with SUI, in 2160) and shown on the tax liability, payroll register and employer cost reports, so filing an NYS-45 no longer has to true up line 5.
- Run Payroll flags setup problems on each employee's preview card, such as no NY IT-2104 on file or a prior-provider YTD balance with no "as of" date.

### Changed
- New employees default to a 2020-and-later W-4.
- Overtime follows the law instead of settings: hours past 40 in the workweek, at no less than time and a half. Time Tracking records hours per day without a daily overtime split, and the week's overtime shows in its total.

### Removed
- The "Enable overtime calculations" setting. Overtime is required by law, so it isn't something to switch off (the setting also had no effect). The overtime multiplier can no longer be set below 1.5.

### Fixed
- Tax deposit auto-fill attributed payments to the quarter they were *made* in rather than the quarter they *pay for*. Because deposits usually land in the following quarter, the earlier quarter kept showing a balance due after it was paid and the current quarter showed less (often nothing) due. Balances are now each quarter's payroll tax less the deposits recorded for that quarter.
- The deposit form shows what each recent quarter owes and defaults to the oldest quarter still owed. A deposit recorded under the wrong quarter can be corrected with **Change quarter** on the Tax Deposits list.
- The Tax Liability page labelled the current quarter as the previous one in US time zones (Q3 showed as "Q2"), counted voided and corrected payroll, and guessed the federal deposit schedule from the period's total instead of using the schedule set in Settings.
- Default dates on the deposit, NYS-1 and filing forms rolled over to the next day after 8pm Eastern.
- NYS-45 line 15 counted every NY withholding payment for the quarter, including payments made with the NYS-45 itself; it now counts only NYS-1 payments.
- NY income tax withholding used the federal W-4 filing status and allowances; the NY (IT-2104) fields in Tax Settings were saved but never used. It now uses the IT-2104.
- Employees claiming dependents on a 2020-or-later W-4 were over-withheld federally every check — Step 3 wasn't applied.
- Health, dental, vision, HSA and FSA deductions were charged Social Security and Medicare; they're exempt (401(k) still isn't). The Form 941 had the opposite error, leaving 401(k) deferrals out of Social Security / Medicare wages.
- Yonkers resident withholding used 16.475% instead of 16.75%, and NYC withholding was about 1/52 of the intended amount.
- The NY Paid Family Leave annual maximum was never reached in practice — it was compared to a single check instead of the year to date.
- The tax year now follows the pay date, so a late-December week paid in January starts the new year's wage bases.
- A prior payroll provider's YTD balances kept counting in later years, using up the new year's Social Security, SUI and FUTA wage bases early. They now count only for their own year, on payroll and on the 941 / NYS-45.
- Deduction annual limits (e.g. 401(k)) never reset in January, and two deductions of the same type shared one year-to-date total. Voiding or correcting a check took the full amount off every deduction of that type.
- The payroll preview counted voided payroll in year-to-date totals, so it could show different numbers than processing produced.
- Saving Tax Settings could quietly switch an employee to a pre-2020 W-4, or set their NY filing status to single, when those fields had been blank.
- Semi-weekly federal deposit deadlines were swapped: Wednesday–Friday paydays are due the following Wednesday and Saturday–Tuesday paydays the following Friday.
- The Mark Paid dialog's default date rolled over to the next day after 8pm Eastern.
- Time Tracking split each day at 8 hours and paid the rest as overtime, so long days in a short week paid overtime that wasn't owed. Payroll now splits each week's total at 40 hours, including hours entered before this fix.

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
