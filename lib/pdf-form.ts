import type { PDFDocument } from 'pdf-lib';

type AcroForm = ReturnType<PDFDocument['getForm']>;

export interface FieldMiss {
  field: string;
  value: string;
  reason: string;
}

/**
 * Records AcroForm writes that fail instead of swallowing them.
 *
 * A failed write is invisible on the generated PDF — the field just stays
 * blank — so the failure mode is a clean, correctly-rendered, completely empty
 * tax form served with a 200. That is exactly how a stale build shipped a blank
 * NYS-45: every field name in the packaged route had been renamed by a later
 * template rebuild, all ~50 writes threw, and nothing surfaced it.
 *
 * Two distinct failures are worth separating:
 *   - a *total* mismatch (nothing landed) means the code and the template
 *     disagree wholesale — never serve that, it looks like a valid blank return
 *   - individual misses (usually a value longer than the field's maxLength)
 *     leave one box empty on an otherwise correct form, which the filer can
 *     see and complete by hand, so the PDF is still worth serving
 */
export class FormFiller {
  private readonly form: AcroForm;
  private written = 0;
  readonly misses: FieldMiss[] = [];

  constructor(form: AcroForm) {
    this.form = form;
  }

  /** Sets a text field. Returns false (and records why) if the write did not land. */
  text(fieldName: string, value: string): boolean {
    try {
      this.form.getTextField(fieldName).setText(value);
      this.written += 1;
      return true;
    } catch (error) {
      this.misses.push({
        field: fieldName,
        value,
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Ticks (or clears) a checkbox. Returns false (and records why) if it did not land. */
  check(fieldName: string, checked: boolean = true): boolean {
    try {
      const box = this.form.getCheckBox(fieldName);
      if (checked) {
        box.check();
      } else {
        box.uncheck();
      }
      this.written += 1;
      return true;
    } catch (error) {
      this.misses.push({
        field: fieldName,
        value: String(checked),
        reason: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  get writtenCount(): number {
    return this.written;
  }

  /**
   * Nothing at all landed — the route and the bundled template disagree about
   * every field name. Callers should refuse to serve the PDF.
   */
  get isTotalMismatch(): boolean {
    return this.written === 0 && this.misses.length > 0;
  }

  /** Logs any misses. Goes to the Electron server log in the desktop build. */
  report(formName: string): void {
    if (this.misses.length === 0) return;
    console.warn(
      `[${formName}] ${this.misses.length} field write(s) did not land (${this.written} succeeded):`
    );
    for (const miss of this.misses) {
      console.warn(`  ${miss.field} <- ${JSON.stringify(miss.value)} — ${miss.reason}`);
    }
  }
}
