import type Phaser from 'phaser';
import { anim, DRAGON_DEFS, dragonPortrait, eggSheet, makeCaveBackdrop, makeRockTiles, recolorAnims, recolorFrames, sheetFrom, WHELP_Z, WYVERN_Z, type CavePalette, type RockTilePalette } from './chapter6Art';
import { makeDragonArt, standPose, type DragonPalette } from './dragonArt';
import { drawDragon } from './rig';

// 챕터 7~10 그림: 용(해골 용왕·뇌룡·마왕의 용 모습)과 새끼·와이번, 다시 칠한 몬스터, 배경

export const BONE_Z = 1.1;
export const STORM_Z = 1.05;
export const SHADOW_Z = 1.15;

const PAL: Record<string, DragonPalette> = {
  bone: { body: 0xd6cdb4, belly: 0x9c9482, wing: 0x34465a, horn: 0xf2ecdc, spike: 0x5e584c, eye: 0x6af0ff, claw: 0x24262c },
  boneWyvern: { body: 0xb4b0a2, belly: 0x8a8678, wing: 0x2a3848, horn: 0xe8e2d0, spike: 0x4e4a40, eye: 0x7af0ff, claw: 0x24262c },
  boneWhelp: { body: 0xc8c2b0, belly: 0x9a9484, wing: 0x3a5068, horn: 0xf0ead8, spike: 0x5a564a, eye: 0x8af4ff, claw: 0x24262c },
  storm: { body: 0x2c4c8c, belly: 0xe6d46e, wing: 0x1c2c58, horn: 0xf0f2ff, spike: 0xffe04a, eye: 0xffffff, claw: 0x141828 },
  stormWyvern: { body: 0x4a6aa4, belly: 0xd8d0a0, wing: 0x283a6c, horn: 0xe8ecff, spike: 0xffd84a, eye: 0xffe04a, claw: 0x141828 },
  stormWhelp: { body: 0x4a78c0, belly: 0xf0e080, wing: 0x2a4080, horn: 0xffffff, spike: 0xffe04a, eye: 0xffffff, claw: 0x141828 },
  shadow: { body: 0x2c1c3c, belly: 0x6a3a8c, wing: 0x1a0c26, horn: 0xffcf50, spike: 0x9a3aff, eye: 0xff3a3a, claw: 0x0c0612 },
  shadowWyvern: { body: 0x3c2c50, belly: 0x7a5a9a, wing: 0x22143a, horn: 0xe8d0ff, spike: 0x8a3aff, eye: 0xff4a6a, claw: 0x0c0612 },
  shadowWhelp: { body: 0x4a3068, belly: 0x9a6ac0, wing: 0x2a1a44, horn: 0xf0e0ff, spike: 0xb05aff, eye: 0xff6a8a, claw: 0x0c0612 },
};

/** 한 속성의 용 셋: 큰 용, 와이번, 새끼 (새끼는 시트만) */
function dragonSet(scene: Phaser.Scene, id: string, bigZ: number): void {
  const big = makeDragonArt(scene, `dg-${id}`, PAL[id], 'dragon', bigZ, 2);
  const wyv = makeDragonArt(scene, `dg-${id}W`, PAL[`${id}Wyvern`], 'wyvern', WYVERN_Z, 2);
  const small = makeDragonArt(scene, `dg-${id}H`, PAL[`${id}Whelp`], 'dragon', WHELP_Z, 1);
  DRAGON_DEFS[id] = big;
  DRAGON_DEFS[`${id}Wyvern`] = wyv;
  dragonPortrait(scene, big, `${id}-dragon-pose`, standPose(bigZ));
  dragonPortrait(scene, wyv, `${id}-wyvern-pose`, standPose(WYVERN_Z, true));
  // 새끼 시트는 chapter6Art의 새끼와 같은 자세로 그린다.
  const fly = { ...standPose(WHELP_Z), by: -24, rot: -6, fold: 0.1, wing: -100, flap: 1, neck: -22, curl: 6, head: 12, tail: 6, tailCurl: -2, fFx: 10, fFy: -8, bFx: -10, bFy: -5 };
  const phase = [Math.PI / 18, 0, (3 * Math.PI) / 18, (2 * Math.PI) / 18];
  const frames = phase.map((t) => drawDragon(scene, small, fly, t));
  const spit = { ...fly, jaw: 30, neck: -8, curl: 4, head: 14 };
  frames.push(drawDragon(scene, small, spit, phase[0]), drawDragon(scene, small, spit, phase[2]));
  sheetFrom(scene, `whelp-${id}`, frames);
  anim(scene, `${id}-whelp-fly`, `whelp-${id}`, [0, 1, 2, 3], 12);
  anim(scene, `${id}-whelp-spit`, `whelp-${id}`, [4, 5, 4, 5], 10, 0);
}

function makeRecolors(scene: Phaser.Scene): void {
  // 챕터 7: 용무덤 사제(창백한 청록 로브), 용골 전사(얼음빛 해골), 서리 망령
  recolorAnims(scene, 'wizard', 'wizard-grave', { hue: 185, minSat: 0.35, light: 1.1 }, [
    ['gpriest-idle', 0, 4, 7],
    ['gpriest-cast', 5, 14, 14, 0],
  ]);
  recolorFrames(scene, 'skeleton', 'skeleton-frost', 8, { hue: 195, sat: 0.5, light: 1.15 }, 'frostskel-walk', 10);
  recolorFrames(scene, 'skeleton-rise', 'skeleton-rise-frost', 6, { hue: 195, sat: 0.5, light: 1.15 }, 'frostskel-rise', 9, 0);
  recolorAnims(scene, 'ghost-idle', 'ghost-frost-idle', { hue: 190, minSat: 0.5, light: 1.25 }, [['fwraith-idle', 0, 6, 9]]);
  recolorAnims(scene, 'ghost-shriek', 'ghost-frost-shriek', { hue: 190, minSat: 0.5, light: 1.25 }, [['fwraith-shriek', 0, 3, 10, 0]]);
  // 챕터 8: 뇌운 술사, 폭풍 하피(노란 날개의 작은 천사), 뇌전 늑대
  recolorAnims(scene, 'wizard', 'wizard-storm', { hue: 222, minSat: 0.5, light: 0.9 }, [
    ['scaller-idle', 0, 4, 7],
    ['scaller-cast', 5, 14, 14, 0],
  ]);
  recolorAnims(scene, 'angel-idle', 'angel-storm-idle', { hue: 48, minSat: 0.55, light: 0.95 }, [['harpy-idle', 0, 7, 10]]);
  recolorAnims(scene, 'angel-attack', 'angel-storm-attack', { hue: 48, minSat: 0.55, light: 0.95 }, [['harpy-attack', 0, 2, 12, 0]]);
  recolorAnims(scene, 'wolf-run', 'wolf-thunder', { hue: 212, minSat: 0.55, light: 1.1 }, [['twolf-run', 0, 3, 12]]);
  // 챕터 9: 마계 병사(검붉은 해골), 마계 투사(검붉은 작은 악마), 마계 주술사, 지옥 기사, 총사령관(검은 몸에 금빛)
  recolorFrames(scene, 'skeleton-clothed', 'skeleton-hell', 8, { hue: 355, minSat: 0.6, light: 0.6 }, 'hellskel-walk', 11);
  recolorFrames(scene, 'skeleton-rise-clothed', 'skeleton-rise-hell', 6, { hue: 355, minSat: 0.6, light: 0.6 }, 'hellskel-rise', 9, 0);
  recolorAnims(scene, 'demon-idle', 'demon-brute-idle', { hue: 350, minSat: 0.7, light: 0.75 }, [['hbrute-idle', 0, 5, 8]]);
  recolorAnims(scene, 'demon-attack', 'demon-brute-attack', { hue: 350, minSat: 0.7, light: 0.75 }, [['hbrute-attack', 0, 10, 14, 0]]);
  recolorAnims(scene, 'wizard', 'wizard-hell', { hue: 352, minSat: 0.55, light: 0.5 }, [
    ['hcaster-idle', 0, 4, 7],
    ['hcaster-cast', 5, 14, 14, 0],
  ]);
  recolorAnims(scene, 'nightmare-idle', 'nightmare-hell-idle', { hue: 12, minSat: 0.7, light: 0.55 }, [['hknight-idle', 0, 3, 6]]);
  recolorAnims(scene, 'nightmare-gallop', 'nightmare-hell-gallop', { hue: 12, minSat: 0.7, light: 0.55 }, [['hknight-gallop', 0, 3, 12]]);
  recolorAnims(scene, 'demon-idle', 'demon-baal-idle', { hue: 42, minSat: 0.7, light: 0.78 }, [['baal-idle', 0, 5, 8]]);
  recolorAnims(scene, 'demon-attack', 'demon-baal-attack', { hue: 42, minSat: 0.7, light: 0.78 }, [['baal-attack', 0, 10, 12, 0]]);
  // 챕터 10: 마왕 근위병(보랏빛 갑옷 해골), 그림자 사제, 마왕(검보라 악마)
  recolorFrames(scene, 'skeleton-clothed', 'skeleton-royal', 8, { hue: 275, minSat: 0.5, light: 0.6 }, 'royalskel-walk', 10);
  recolorFrames(scene, 'skeleton-rise-clothed', 'skeleton-rise-royal', 6, { hue: 275, minSat: 0.5, light: 0.6 }, 'royalskel-rise', 9, 0);
  recolorAnims(scene, 'wizard', 'wizard-shadow', { hue: 282, minSat: 0.6, light: 0.55 }, [
    ['spriest-idle', 0, 4, 7],
    ['spriest-cast', 5, 14, 14, 0],
  ]);
  recolorAnims(scene, 'demon-idle', 'demon-king-idle', { hue: 285, minSat: 0.65, light: 0.62 }, [['dking-idle', 0, 5, 8]]);
  recolorAnims(scene, 'demon-attack', 'demon-king-attack', { hue: 285, minSat: 0.65, light: 0.62 }, [['dking-attack', 0, 10, 12, 0]]);
}

export const CAVE_BONE: CavePalette = { top: 0x06080e, bottom: 0x1a2a3a, peakA: 0x0e141c, peakB: 0x182430, flowHi: 0x9ae8ff, flowLo: 0x2a4a6a, spark: 0xbff4ff, rockA: 0x1e2630, rockB: 0x0c1016, rockEdge: 0x4a5a6a, crack: 0x7ad8ff, ceiling: true };
const ROCK_BONE: RockTilePalette = { top: 0xb8c4cc, topDark: 0x8a96a0, a: 0x3a4450, b: 0x161c24, spot: 0x2a3038, crackHi: 0x9ae8ff, crackLo: 0x2a5a7a };
export const CAVE_STORM: CavePalette = { top: 0x05081a, bottom: 0x23315a, peakA: 0x10162c, peakB: 0x1a2240, flowHi: 0x9ab8ff, flowLo: 0x30406a, spark: 0xffffff, rockA: 0x26304a, rockB: 0x10141f, rockEdge: 0x5a6a90, crack: 0xffe04a, ceiling: false };
const ROCK_STORM: RockTilePalette = { top: 0x9aa4b8, topDark: 0x6a7488, a: 0x384056, b: 0x161a26, spot: 0x2a3044, crackHi: 0xffe04a, crackLo: 0x6a5a20 };
export const CAVE_HELL: CavePalette = { top: 0x1a0204, bottom: 0x6a1008, peakA: 0x0e0204, peakB: 0x1e0606, flowHi: 0xffa02a, flowLo: 0xa0200a, spark: 0xffd070, rockA: 0x1a0a0a, rockB: 0x080202, rockEdge: 0x5a1a10, crack: 0xff5a1a, ceiling: false };
const ROCK_HELL: RockTilePalette = { top: 0x5a2a22, topDark: 0x3e1a16, a: 0x261210, b: 0x0a0404, spot: 0x1a0a08, crackHi: 0xff6a1a, crackLo: 0x901a08 };
const ROCK_THRONE: RockTilePalette = { top: 0x8a7aa0, topDark: 0x5e5070, a: 0x2e2440, b: 0x0e0a16, spot: 0x221a30, crackHi: 0xb05aff, crackLo: 0x401a6a };
export const CAVE_THRONE: CavePalette = { top: 0x08040e, bottom: 0x2a1236, peakA: 0x0c0614, peakB: 0x180c22, flowHi: 0xc06aff, flowLo: 0x3a1460, spark: 0xffd060, rockA: 0x1e1428, rockB: 0x0a0610, rockEdge: 0x4a3a60, crack: 0xb05aff, ceiling: true };

export function createLateArt(scene: Phaser.Scene): void {
  dragonSet(scene, 'bone', BONE_Z);
  dragonSet(scene, 'storm', STORM_Z);
  dragonSet(scene, 'shadow', SHADOW_Z);
  eggSheet(scene, 'soul-egg', 'segg', 0xd8e4ea, 0x6a8a9a, 0x8af4ff);
  makeRecolors(scene);
  makeCaveBackdrop(scene, 'boneyard', CAVE_BONE);
  makeRockTiles(scene, 'boneyard-tiles', ROCK_BONE);
  makeCaveBackdrop(scene, 'storm', CAVE_STORM);
  makeRockTiles(scene, 'storm-tiles', ROCK_STORM);
  makeCaveBackdrop(scene, 'hell', CAVE_HELL);
  makeRockTiles(scene, 'hell-tiles', ROCK_HELL);
  makeCaveBackdrop(scene, 'throne', CAVE_THRONE);
  makeRockTiles(scene, 'throne-tiles', ROCK_THRONE);
}
