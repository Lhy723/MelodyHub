import { describe, expect, it } from 'vitest';
import { paginate } from './pagination';

describe('paginate', () => {
  it('returns all pages when count fits', () => {
    expect(paginate(1, 5, 1, 1)).toEqual([1, 2, 3, 4, 5]);
  });

  it('collapses the right side near the start', () => {
    expect(paginate(1, 10, 1, 1)).toEqual([1, 2, 3, 4, 5, 'gap-r', 10]);
  });

  it('collapses the left side near the end', () => {
    expect(paginate(10, 10, 1, 1)).toEqual([1, 'gap-l', 6, 7, 8, 9, 10]);
  });

  it('collapses both sides in the middle', () => {
    expect(paginate(5, 10, 1, 1)).toEqual([1, 'gap-l', 4, 5, 6, 'gap-r', 10]);
  });
});
