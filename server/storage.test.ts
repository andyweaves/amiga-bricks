import { describe, expect, test } from 'vitest';
import { encodeVolumePath } from './storage';

describe('encodeVolumePath', () => {
  test('encodes square brackets, which the Files API rejects unencoded', () => {
    expect(encodeVolumePath('games/Game (Disk 1 of 2)[cr HF].adf')).toBe(
      'games/Game%20%28Disk%201%20of%202%29%5Bcr%20HF%5D.adf'
    );
  });

  test.each([
    ["Sensible World of Soccer '95-'96.adf", 'Sensible%20World%20of%20Soccer%20%2795-%2796.adf'],
    ['Lemmings 1 (DMA Design + Psygnosis) A.adf', 'Lemmings%201%20%28DMA%20Design%20%2B%20Psygnosis%29%20A.adf'],
    ['100% Game #2?.adf', '100%25%20Game%20%232%3F.adf'],
    ['Simpsons, The!*.adf', 'Simpsons%2C%20The%21%2A.adf'],
  ])('encodes %s', (name, encoded) => {
    expect(encodeVolumePath(`games/${name}`)).toBe(`games/${encoded}`);
  });

  test('keeps the directory separators', () => {
    expect(encodeVolumePath('screenshots/my game/123.png')).toBe('screenshots/my%20game/123.png');
  });

  test('round-trips through URL parsing without double-encoding', () => {
    const name = 'Game (Disk 1)[cr HF].adf';
    const url = new URL(`/api/2.0/fs/files/Volumes/c/s/v/${encodeVolumePath(`games/${name}`)}`, 'https://example.com');
    expect(decodeURIComponent(url.pathname)).toBe(`/api/2.0/fs/files/Volumes/c/s/v/games/${name}`);
  });
});
