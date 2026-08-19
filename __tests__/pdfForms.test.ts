import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { FormFiller } from '@/lib/pdf-form';
import fs from 'fs';
import path from 'path';

const NYS45 = path.join(process.cwd(), 'public/document-templates/state/NYS-45.pdf');

async function nys45Form() {
  const doc = await PDFDocument.load(fs.readFileSync(NYS45));
  return doc.getForm();
}

describe('FormFiller', () => {
  it('records a miss instead of swallowing it', async () => {
    const filler = new FormFiller(await nys45Form());

    expect(filler.text('line 1', '48250.00')).toBe(true);
    expect(filler.text('no such field at all', 'x')).toBe(false);

    expect(filler.writtenCount).toBe(1);
    expect(filler.misses).toHaveLength(1);
    expect(filler.misses[0].field).toBe('no such field at all');
  });

  it('flags a total mismatch only when nothing landed', async () => {
    const allBad = new FormFiller(await nys45Form());
    allBad.text('employer_name', 'ACME'); // the pre-1.2.1 field name
    allBad.text('total_wages', '100.00');
    expect(allBad.isTotalMismatch).toBe(true);

    const partial = new FormFiller(await nys45Form());
    partial.text('line 1', '100.00');
    partial.text('employer_name', 'ACME');
    expect(partial.isTotalMismatch).toBe(false);
  });

  it('is quiet when every write lands', async () => {
    const filler = new FormFiller(await nys45Form());
    filler.text('line 1', '100.00');
    expect(filler.misses).toHaveLength(0);
    expect(filler.isTotalMismatch).toBe(false);
  });
});

describe('NYS-45 template field constraints', () => {
  /**
   * Part C column (a) is a 9-character box. Writing the hyphenated SSN silently
   * blanked the whole column on every generated return until 1.2.1.
   */
  it('accepts a bare 9-digit SSN and rejects the hyphenated form', async () => {
    const filler = new FormFiller(await nys45Form());

    expect(filler.text('a_SSN.0', '123456789')).toBe(true);
    expect(filler.text('a_SSN.1', '123-45-6789')).toBe(false);
    expect(filler.misses[0].reason).toMatch(/maxLength=9/);
  });

  /**
   * The withholding ID boxes hold 10/2/1 characters. The route slices to match;
   * a 2/9/rest split overflows box 2, which pdf-lib rejects outright, leaving
   * all but the first two digits of the ID off the return.
   */
  it('fits the withholding ID slices the route writes', async () => {
    const filler = new FormFiller(await nys45Form());
    const wtId = '123456789012';

    expect(filler.text('withholding id number 1', wtId.slice(0, 10))).toBe(true);
    expect(filler.text('withholding id number 2', wtId.slice(10, 12))).toBe(true);
    expect(filler.text('withholding id number 3', wtId.slice(12, 13))).toBe(true);
    expect(filler.misses).toHaveLength(0);
  });

  it('fits a typical 9-digit withholding ID in the first box', async () => {
    const filler = new FormFiller(await nys45Form());
    expect(filler.text('withholding id number 1', '123456789'.slice(0, 10))).toBe(true);
    expect(filler.misses).toHaveLength(0);
  });

  /** Guards the header and Part A/B/C names the route depends on. */
  it('still has every field name the route writes to', async () => {
    const filler = new FormFiller(await nys45Form());
    const names = [
      'ui emp reg number 1',
      'ui emp reg number 2',
      'withholding id number 1',
      'year',
      'employer legal name',
      'Employer address',
      'Employer city name',
      'Employer state name',
      'Employer ZIP name',
      'no of emp a',
      'line 1',
      'line 4 pct 1',
      'line 6',
      'line 13',
      'line 24',
      'a_SSN.0',
      'b_Last_name.0',
      'c_First_name.0',
      'd_MI.0',
      'e_Wage type.0',
      'f_Total_UI.0',
      'g_Gross_federal.0',
      'h_NYS_tax.0',
      'i_total_NYC_tax.0',
      'j_Yonkers_tax.0',
      'f_Total_UI_B',
      'Page',
    ];

    for (const name of names) filler.text(name, '1');

    expect(filler.misses.map((m) => m.field)).toEqual([]);
  });
});
