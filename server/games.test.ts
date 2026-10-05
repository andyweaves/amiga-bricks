import { describe, expect, test } from 'vitest';
import { detectModel, filesForGame, groupGames, isSafeFilename, listRoms, parseDiskInfo } from './games';

describe('parseDiskInfo', () => {
  test('single-disk game has no disk number', () => {
    expect(parseDiskInfo('Sensible Soccer')).toEqual({ base: 'Sensible Soccer', disk: null });
  });

  test.each([
    ['Monkey Island_Disk 1', 'Monkey Island', 1],
    ['Monkey Island_Disk2', 'Monkey Island', 2],
    ['Monkey Island_d1', 'Monkey Island', 1],
    ['Game (Disk 2 of 3)', 'Game', 2],
    ['Game (Disk 1)[cr FLT]', 'Game', 1],
  ])('numeric pattern %s', (stem, base, disk) => {
    expect(parseDiskInfo(stem)).toEqual({ base, disk });
  });

  test.each([
    ['Monkey Island A', 'Monkey Island', 1],
    ['Monkey Island B', 'Monkey Island', 2],
    ['Monkey Island_Disk A', 'Monkey Island', 1],
  ])('alpha pattern %s', (stem, base, disk) => {
    expect(parseDiskInfo(stem)).toEqual({ base, disk });
  });

  test('save disk is flagged with the sentinel', () => {
    expect(parseDiskInfo('Game savedisk').disk).toBe(-1);
  });
});

describe('groupGames', () => {
  test('groups a numbered multi-disk game and sorts the disks', () => {
    const games = groupGames(['Monkey Island_Disk 2.adf', 'Monkey Island_Disk 1.adf', 'Monkey Island_Disk 3.adf']);
    expect(games).toHaveLength(1);
    expect(games[0].slug).toBe('monkey-island');
    expect(games[0].disks?.map((d) => d.disk)).toEqual([1, 2, 3]);
    expect(games[0].hasSaveDisk).toBe(false);
  });

  test('detects a save disk and excludes it from the disk list', () => {
    const games = groupGames(['RPG_Disk 1.adf', 'RPG_Disk 2.adf', 'RPG savedisk.adf']);
    expect(games[0].disks).toHaveLength(2);
    expect(games[0].hasSaveDisk).toBe(true);
  });

  test('keeps single-disk games as individual entries', () => {
    const games = groupGames(['Sensible Soccer.adf', 'Lemmings.adf']);
    expect(games.map((g) => g.name)).toEqual(['Lemmings', 'Sensible Soccer']);
    expect(games.every((g) => g.disks === null && g.filename)).toBe(true);
  });

  test('ignores unsupported file types', () => {
    expect(groupGames(['readme.txt', 'notes.md'])).toHaveLength(0);
  });
});

describe('filesForGame', () => {
  const files = [
    'Monkey Island_Disk 1.adf',
    'Monkey Island_Disk 2.adf',
    'Monkey Island savedisk.adf',
    'Sensible Soccer.adf',
  ];

  test('single-disk game resolves to its one file', () => {
    expect(filesForGame(files, 'Sensible Soccer.adf')).toEqual(['Sensible Soccer.adf']);
  });

  test('multi-disk game resolves to all disks plus the save disk', () => {
    expect(filesForGame(files, 'monkey-island').sort()).toEqual([
      'Monkey Island savedisk.adf',
      'Monkey Island_Disk 1.adf',
      'Monkey Island_Disk 2.adf',
    ]);
  });

  test('unknown key resolves to nothing', () => {
    expect(filesForGame(files, 'does-not-exist')).toEqual([]);
  });

  test('games whose names slugify alike are resolved separately', () => {
    const clash = [
      'Monkey Island_Disk 1.adf',
      'Monkey Island_Disk 2.adf',
      'Monkey-Island_d1.adf',
      'Monkey-Island_d2.adf',
    ];
    expect(groupGames(clash).map((g) => g.slug)).toEqual(['monkey-island', 'monkey-island-2']);
    expect(filesForGame(clash, 'monkey-island').sort()).toEqual([
      'Monkey Island_Disk 1.adf',
      'Monkey Island_Disk 2.adf',
    ]);
    expect(filesForGame(clash, 'monkey-island-2').sort()).toEqual(['Monkey-Island_d1.adf', 'Monkey-Island_d2.adf']);
  });

  test('single-disk game takes its own save disk with it', () => {
    expect(filesForGame(['Elite.adf', 'Elite savedisk.adf'], 'Elite.adf').sort()).toEqual([
      'Elite savedisk.adf',
      'Elite.adf',
    ]);
  });

  test('a shared save disk is kept when other games still use it', () => {
    const shared = ['Game.adf', 'Game.adz', 'Game savedisk.adf'];
    expect(filesForGame(shared, 'Game.adf')).toEqual(['Game.adf']);
  });
});

describe('isSafeFilename', () => {
  test.each(['Monkey Island_Disk 1.adf', 'kick13.rom', 'Game (Disk 1)[cr FLT].adf', '1700000000000.png'])(
    'accepts %s',
    (name) => {
      expect(isSafeFilename(name)).toBe(true);
    }
  );

  test.each(['', '.', '..', '../roms/kick.rom', 'a/b.adf', 'a\\b.adf', '.hidden', 'nul\0.adf'])(
    'rejects %j',
    (name) => {
      expect(isSafeFilename(name)).toBe(false);
    }
  );
});

describe('detectModel', () => {
  test.each([
    ['amiga-os-130.rom', 'A500'],
    ['kick204.rom', 'A600'],
    ['kick310.rom', 'A1200'],
    ['cd32.rom', 'CD32'],
  ])('%s -> %s', (filename, model) => {
    expect(detectModel(filename)).toBe(model);
  });
});

describe('listRoms', () => {
  test('discovers roms by extension or "kick" in the name', () => {
    const roms = listRoms(['amiga-os-130.rom', 'kickstart', 'cover.png']);
    expect(roms.map((r) => r.filename)).toEqual(['amiga-os-130.rom', 'kickstart']);
    expect(roms[0].model).toBe('A500');
  });
});
