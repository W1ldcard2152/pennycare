import { describe, it, expect } from 'vitest';
import {
  DOCUMENT_TYPES,
  getDocumentTypeById,
  getRequiredDocumentTypes,
  getDocumentTypesByCategory,
} from '@/lib/documentTypes';

describe('DOCUMENT_TYPES', () => {
  it('contains at least 10 document types', () => {
    expect(DOCUMENT_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it('all entries have required fields', () => {
    DOCUMENT_TYPES.forEach((dt) => {
      expect(dt.id).toBeTruthy();
      expect(dt.label).toBeTruthy();
      expect(['federal', 'state', 'company', 'certification']).toContain(dt.category);
      expect(typeof dt.required).toBe('boolean');
    });
  });

  it('has unique IDs', () => {
    const ids = DOCUMENT_TYPES.map((dt) => dt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('getDocumentTypeById', () => {
  it('finds W-4 document type', () => {
    const w4 = getDocumentTypeById('w4');
    expect(w4).toBeDefined();
    expect(w4!.label).toContain('W-4');
    expect(w4!.category).toBe('federal');
    expect(w4!.required).toBe(true);
  });

  it('finds I-9 document type', () => {
    const i9 = getDocumentTypeById('i9');
    expect(i9).toBeDefined();
    expect(i9!.required).toBe(true);
  });

  it('returns undefined for unknown ID', () => {
    expect(getDocumentTypeById('nonexistent')).toBeUndefined();
  });
});

describe('getRequiredDocumentTypes', () => {
  it('returns only required documents', () => {
    const required = getRequiredDocumentTypes();
    required.forEach((dt) => {
      expect(dt.required).toBe(true);
    });
  });

  it('includes W-4 and I-9', () => {
    const required = getRequiredDocumentTypes();
    const ids = required.map((dt) => dt.id);
    expect(ids).toContain('w4');
    expect(ids).toContain('i9');
  });

  it('does not include optional documents', () => {
    const required = getRequiredDocumentTypes();
    const ids = required.map((dt) => dt.id);
    expect(ids).not.toContain('ase_cert');
    expect(ids).not.toContain('other');
  });
});

describe('getDocumentTypesByCategory', () => {
  it('returns federal documents', () => {
    const federal = getDocumentTypesByCategory('federal');
    expect(federal.length).toBeGreaterThan(0);
    federal.forEach((dt) => {
      expect(dt.category).toBe('federal');
    });
  });

  it('returns state documents', () => {
    const state = getDocumentTypesByCategory('state');
    expect(state.length).toBeGreaterThan(0);
    state.forEach((dt) => {
      expect(dt.category).toBe('state');
    });
  });

  it('returns certification documents', () => {
    const certs = getDocumentTypesByCategory('certification');
    expect(certs.length).toBeGreaterThan(0);
    certs.forEach((dt) => {
      expect(dt.category).toBe('certification');
    });
  });

  it('returns empty array for unknown category', () => {
    expect(getDocumentTypesByCategory('unknown')).toHaveLength(0);
  });
});
