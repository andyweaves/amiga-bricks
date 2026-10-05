import { describe, expect, test } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { diskImageName, unpackDiskImages } from './zip';

describe('diskImageName', () => {
  test('keeps descriptive entry names', () => {
    expect(diskImageName('Desert Strike.zip', 'Desert Strike (Electronic Arts) A.adf')).toBe(
      'Desert Strike (Electronic Arts) A.adf'
    );
  });

  test.each([
    ['disk1.adf', 'Lemmings (Disk 1).adf'],
    ['Disk 2.ADF', 'Lemmings (Disk 2).adf'],
    ['disc_3.adf', 'Lemmings (Disk 3).adf'],
    ['d4.adz', 'Lemmings (Disk 4).adz'],
    ['b.adf', 'Lemmings (Disk B).adf'],
    ['sub/dir/disk1.adf', 'Lemmings (Disk 1).adf'],
  ])('renames generic %s after the zip', (entry, expected) => {
    expect(diskImageName('Lemmings.zip', entry)).toBe(expected);
  });
});

describe('unpackDiskImages', () => {
  test('extracts only disk images, skipping macOS metadata and other files', async () => {
    const zip = zipSync({
      'Game A.adf': strToU8('aaa'),
      'Game B.adf': strToU8('bbb'),
      'readme.txt': strToU8('hi'),
      '__MACOSX/._Game A.adf': strToU8('x'),
    });
    const files = await unpackDiskImages(new File([new Uint8Array(zip)], 'Game.zip'));
    expect(files.map((f) => f.name)).toEqual(['Game A.adf', 'Game B.adf']);
    expect(await files[1].text()).toBe('bbb');
  });

  test('returns nothing for a zip without disk images', async () => {
    const zip = zipSync({ 'readme.txt': strToU8('hi') });
    expect(await unpackDiskImages(new File([new Uint8Array(zip)], 'Notes.zip'))).toEqual([]);
  });
});
