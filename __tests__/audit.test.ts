import { describe, it, expect } from 'vitest';
import { computeChanges } from '@/lib/audit';

describe('computeChanges', () => {
  it('detects changed fields', () => {
    const before = { name: 'John', rate: 25, active: true };
    const after = { name: 'John', rate: 30, active: true };
    const changes = computeChanges(before, after, ['name', 'rate', 'active']);
    expect(changes).not.toBeNull();
    expect(changes!.rate).toEqual({ old: 25, new: 30 });
    expect(changes!.name).toBeUndefined();
  });

  it('returns null when nothing changed', () => {
    const obj = { name: 'John', rate: 25 };
    const changes = computeChanges(obj, obj, ['name', 'rate']);
    expect(changes).toBeNull();
  });

  it('detects multiple changes', () => {
    const before = { firstName: 'John', lastName: 'Doe', position: 'Jr Mechanic' };
    const after = { firstName: 'John', lastName: 'Smith', position: 'Sr Mechanic' };
    const changes = computeChanges(before, after, ['firstName', 'lastName', 'position']);
    expect(changes).not.toBeNull();
    expect(Object.keys(changes!)).toHaveLength(2);
    expect(changes!.lastName).toEqual({ old: 'Doe', new: 'Smith' });
    expect(changes!.position).toEqual({ old: 'Jr Mechanic', new: 'Sr Mechanic' });
  });

  it('handles null values', () => {
    const before = { value: null };
    const after = { value: 'something' };
    const changes = computeChanges(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
      ['value']
    );
    expect(changes).not.toBeNull();
    expect(changes!.value).toEqual({ old: null, new: 'something' });
  });

  it('handles boolean changes', () => {
    const before = { isActive: true };
    const after = { isActive: false };
    const changes = computeChanges(before, after, ['isActive']);
    expect(changes).not.toBeNull();
    expect(changes!.isActive).toEqual({ old: true, new: false });
  });

  it('only tracks specified fields', () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 10, b: 20, c: 30 };
    const changes = computeChanges(before, after, ['a', 'c']);
    expect(changes).not.toBeNull();
    expect(Object.keys(changes!)).toHaveLength(2);
    expect(changes!.b).toBeUndefined();
  });
});
