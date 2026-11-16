// 동작의 타격: 동작마다 정해진 시점에 판정과 연출을 낸다.

import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import type { BattleScene } from '../battleScene';
import { DEPTH } from '../fx';
import type { ActionKind } from '../player2d';
import { meleeLook } from '../weaponArt';
import { afterglow, column, crescent, flare, flutter, glow, hues, impactBurst, PAL, pop, rays, shards, shockwave, tint, twinkles, wisps } from '../vfx';
import { comboSlash, manaCombo, gunShot } from './basic';
import { box, around, combatState, slashStyle, swingFx, LONG, swordReach } from './shared';

const SWINGS: ReadonlySet<ActionKind> = new Set([
  'slash',
  'airSlash',
  'crouchSlash',
  'thrust',
  'upper',
  'whirl',
  'sunder',
  'cleave',
  'crescent',
  'skyfall',
  'hamstring',
  'iai',
]);

/** 레이저 판정 띠의 절반 높이 (px) */
const LASER_HALF_H = 12;
/** 발도가 지나간 길 (뒤따르는 칼바람이 친다) */
let iaiPath: { x0: number; len: number; y: number } | null = null;

export function performHit(b: BattleScene, kind: ActionKind, index: number): void {
  const p = b.player;
  const base = b.weaponBase();
  const dao = p.weapon.def.type === 'dao';
  const mul = dao ? 1.2 : 1;
  // 기본 잔상 색은 무기마다 다르다 (화염검은 붉게, 월광도는 푸르게).
  const color = meleeLook(p.weapon.def).slash;
  const f = p.facing;
  if (SWINGS.has(kind)) sfx.play('slash');
  switch (kind) {
    case 'slash':
      comboSlash(b, p.combo || 1, index, base * mul, color);
      break;
    case 'airSlash':
      b.fx.slash(p.x + f * 14, p.y - 4, f, swordReach(p, 40), color, true, { style: slashStyle(b), stretch: LONG[0], squash: LONG[1] });
      b.fx.sparks(p.x + f * 40, p.y + 14, color, 4, Math.PI / 2 - f * 0.6, 0.5, 170, 260);
      swingFx(b, p.x + f * 36, p.y - 4);
      box(b, -8, swordReach(p, 76), 76, 6, base * 1.0 * mul, { basic: true, knock: 70 });
      break;
    case 'crouchSlash':
      b.fx.slash(p.x + f * 18, p.y + 10, f, swordReach(p, 34), color, false, { style: slashStyle(b), stretch: LONG[0], squash: 0.6 });
      b.fx.sparks(p.x + f * 44, p.feet - 2, color, 4, f === 1 ? -0.5 : Math.PI + 0.5, 0.5, 150, 260);
      b.fx.smoke(p.x + f * 30, p.feet - 4, 1, 0x9a8a70, -6);
      swingFx(b, p.x + f * 36, p.y + 10);
      box(b, 0, swordReach(p, 70), 24, -10, base * 0.9 * mul, { basic: true, knock: 60 });
      break;
    case 'thrust':
      // 찌르기: 칼끝에서 빛이 앞으로 꿰뚫고 나간다.
      p.body.setVelocityX(f * 220);
      b.fx.streak(p.x + f * 118, p.y - 2, f === 1 ? 0 : Math.PI, 104, 0xdff4ff, 220, 3);
      b.fx.spark(p.x + f * 112, p.y - 2, 0xdff4ff, 2);
      b.fx.burst(p.x + f * 60, p.y - 2, 0xdff4ff, 4, 80, 260);
      b.fx.sparks(p.x + f * 30, p.y - 2, color, 8, f === 1 ? 0 : Math.PI, 0.3, 320, 260, 0);
      b.fx.pop(p.x + f * 110, p.y - 2, 0xdff4ff, 1.1, 0.45);
      p.afterimage(color);
      box(b, 0, 110, 22, 2, base * 1.3, { basic: true, knock: 120 });
      break;
    case 'cleave': {
      // 차징 횡베기: 모은 만큼 커지고, 끝까지 모으면 불꽃처럼 터진다.
      const c = combatState.cleaveCharge;
      const col = c > 0.95 ? 0xffb060 : color;
      b.fx.slash(p.x + f * 14, p.y - 2, f, 46 + c * 16, col, true, { style: slashStyle(b), stretch: 1.4, squash: 0.8 });
      if (c > 0.5) b.fx.slash(p.x + f * 10, p.y - 2, f, 36 + c * 10, col, false, { up: true, speed: 1.4, style: slashStyle(b), stretch: 1.4, squash: 0.8 });
      b.fx.sparks(p.x + f * (50 + c * 20), p.y + 4, col, 5 + Math.round(c * 8), f === 1 ? 0.4 : Math.PI - 0.4, 0.8, 200 + c * 100, 320);
      if (c > 0.5) p.afterimage(col);
      box(b, 0, 90 + c * 20, 56, 2, base * (1.1 + 1.4 * c), { basic: true, knock: 140 + c * 80 });
      if (c > 0.95) {
        b.fx.shake(0.8);
        b.fx.spark(p.x + f * 50, p.y - 2, 0xffc080, 3);
        b.fx.burst(p.x + f * 40, p.y - 2, 0xffb060, 16, 160, 380);
        b.fx.ring(p.x + f * 30, p.feet, 70, 0xffa040);
        pop(b, p.x + f * 56, p.y - 2, 0xfff0c0, 2.4);
        rays(b, p.x + f * 56, p.y - 2, 8, 70, PAL.flame, 300);
        twinkles(b, p.x + f * 60, p.y - 6, 40, 0xfff0c0, 4);
      }
      break;
    }
    // ─── 검사 초식 ───
    case 'whirl': {
      // 선풍: 몸을 돌리며 앞뒤로 네 번 벤다.
      const dir = (index % 2 === 0 ? f : -f) as 1 | -1;
      b.fx.slash(p.x + dir * 4, p.y - 2, dir, 46, meleeLook(p.weapon.def).slash, true, { up: index % 2 === 1, speed: 1.3, style: slashStyle(b), stretch: 1.25 });
      b.fx.sparks(p.x + dir * 50, p.y, 0x8fe0ff, 5, dir === 1 ? 0 : Math.PI, 1.0, 230, 300);
      p.afterimage(0x8fe0ff);
      // 몸을 감싸는 거대한 회오리 참격
      // 벨 때마다 하늘색과 청록이 번갈아 감기고, 바람결과 잎이 딸려 돈다.
      crescent(b, p.x, p.y - 4, dir, 64 + index * 8, index % 2 ? PAL.aurora : PAL.sky, { from: index % 2 ? 1.6 : -1.6, to: index % 2 ? -1.4 : 1.4, ms: 260 });
      shards(b, p.x, p.y, PAL.sky, 10, 200, 360);
      wisps(b, p.x, p.y - 2, index % 2 ? PAL.aurora : PAL.sky, 3, 70 + index * 8, 360, { curl: 3.6, width: 5 });
      flutter(b, p.x, p.y - 4, 'leaf', [0x7fffd8, 0x8fe0ff, 0xc8a0ff, 0xffffff], 4, { spread: 16, speed: 190, gravity: 30, life: 620 });
      if (index === 3) {
        glow(b, p.x, p.y, 150, 0x5a3aff, 520, 0.6);
        wisps(b, p.x, p.y, PAL.aurora, 7, 130, 520, { curl: 3.2, width: 7 });
        afterglow(b, p.x, p.feet, 190, PAL.sky, 'star', 900);
        shockwave(b, p.x, p.feet, 170, PAL.sky, 480);
        rays(b, p.x, p.y, 12, 120, PAL.sky);
        flare(b, p.x, p.y, 50, PAL.sky);
        pop(b, p.x, p.y, 0xffffff, 3);
        twinkles(b, p.x, p.y - 6, 70, 0xdff4ff, 6);
        b.fx.shake(0.8);
      }
      around(b, 120, 60, 2, b.skillBase({ str: 0.75 }), { stun: 1.0, knock: index === 3 ? 140 : 40 });
      break;
    }
    case 'upper':
      // 승천: 두 번 빠르게 베고, 마지막에 하늘로 올려 벤다.
      if (index < 2) {
        b.fx.slash(p.x + f * 14, p.y - 2, f, 30, 0xffe08a, false, { rot: index === 0 ? -0.25 : 0.25, up: index === 1, speed: 1.3, style: 'holy', stretch: 1.3 });
        b.fx.sparks(p.x + f * 46, p.y - 2, 0xffe08a, 4, f === 1 ? (index ? -0.8 : 0.8) : Math.PI + (index ? 0.8 : -0.8), 0.6, 200, 260);
        crescent(b, p.x + f * 10, p.y - 2, f, 56, index ? PAL.sun : PAL.gold, { from: index === 0 ? -1.3 : 1.2, to: index === 0 ? 1.0 : -1.0, ms: 240 });
        flutter(b, p.x + f * 40, p.y - 2, 'flame', hues(PAL.sun), 4, { spread: 10, speed: 70, life: 520 });
        p.body.setVelocityX(f * 90);
        box(b, 0, 60, 44, 2, b.skillBase({ str: 0.6 }), { knock: 30 });
      } else {
        b.fx.slash(p.x + f * 6, p.y - 20, f, 46, 0xffe08a, true, { up: true, style: 'holy', squash: 1.25 });
        b.fx.sparks(p.x + f * 34, p.y - 30, 0xffe08a, 12, -Math.PI / 2, 0.5, 340, 480, 200);
        twinkles(b, p.x + f * 38, p.y - 80, 50, 0xfff6c0, 6, 420);
        p.afterimage(0xffe08a);
        b.fx.pillar(p.x + f * 34, p.feet, 0xffd060, 120, 420);
        b.fx.embers(p.x + f * 34, p.y - 20, 0xffe08a, 12, 18, 70);
        // 하늘을 찌르는 금빛 기둥
        // 해돋이: 다홍 테두리의 금빛 기둥이 솟고, 불꽃 혀와 분홍 결이 함께 치솟는다.
        column(b, p.x + f * 40, p.feet, 26, 340, PAL.sun, 650);
        crescent(b, p.x + f * 20, p.y - 30, f, 80, PAL.sun, { from: 1.4, to: -1.7, ms: 320 });
        rays(b, p.x + f * 40, p.y - 40, 10, 110, PAL.gold);
        shards(b, p.x + f * 40, p.y - 30, PAL.sun, 24, 260, 600);
        wisps(b, p.x + f * 38, p.feet - 10, PAL.sun, 5, 150, 560, { angle: -Math.PI / 2, cone: 0.5, curl: 1.8, width: 7 });
        flutter(b, p.x + f * 38, p.y - 30, 'flame', hues(PAL.sun), 14, { spread: 16, spreadY: 40, speed: 120, cone: 0.6, gravity: -120, life: 800 });
        glow(b, p.x + f * 38, p.y - 50, 110, 0xff2a6a, 520, 0.55);
        afterglow(b, p.x + f * 38, p.feet, 110, PAL.sun, 'flame', 800);
        b.fx.shake(0.9);
        box(b, 0, 52, 110, 34, b.skillBase({ str: 1.8 }), { stun: 1.2, knock: 40 });
      }
      break;
    case 'sunder':
      // 십자: 엇갈려 두 번 베어 X자를 새기고, 그 가운데를 찌른다.
      if (index < 2) {
        b.fx.slash(p.x + f * 14, p.y - 2, f, 32, 0xff6a6a, false, { rot: index === 0 ? -0.65 : 0.65, up: index === 1, speed: 1.3, style: 'blood', stretch: 1.35 });
        b.fx.sparks(p.x + f * 48, p.y - 2, 0xff6a6a, 5, f === 1 ? (index ? -0.9 : 0.9) : Math.PI + (index ? 0.9 : -0.9), 0.5, 220, 300, 420);
        // X자를 크게 새긴다.
        crescent(b, p.x + f * 40, p.y - 2, f, 60, index ? PAL.rose : PAL.crimson, { from: index === 0 ? -2.3 : 2.3, to: index === 0 ? 0.8 : -0.8, ms: 300, squash: 0.9 });
        flutter(b, p.x + f * 60, p.y - 2, 'petal', [0xff3a5a, 0xff8ad0, 0xc03ae0], 4, { spread: 14, speed: 110, gravity: 260, life: 600 });
        box(b, 0, 60, 44, 2, b.skillBase({ str: 0.6 }), { vuln: [0.25, 6], knock: 30 });
      } else {
        p.body.setVelocityX(f * 160);
        b.fx.streak(p.x + f * 92, p.y - 2, f === 1 ? 0 : Math.PI, 84, 0xff6a6a, 240, 3);
        b.fx.spark(p.x + f * 86, p.y - 2, 0xff9a9a, 2, Math.PI / 4);
        b.fx.burst(p.x + f * 70, p.y - 2, 0xff6a6a, 10, 120, 320);
        // 십자의 가운데를 꿰뚫는 붉은 섬광
        b.fx.bigSlash(p.x, p.y - 2, p.x + f * 200, p.y - 2, 0xff3a5a, 9, 320);
        impactBurst(b, p.x + f * 90, p.y - 2, 50, PAL.crimson);
        // X의 가운데에서 자주색 빛이 번지고 붉은 꽃잎처럼 핏방울이 흩어진다.
        rays(b, p.x + f * 90, p.y - 2, 8, 90, PAL.rose, 340);
        wisps(b, p.x + f * 80, p.y - 2, PAL.crimson, 5, 80, 460, { angle: f === 1 ? 0 : Math.PI, cone: 0.9, curl: 2.4 });
        flutter(b, p.x + f * 90, p.y - 2, 'petal', [0xff3a5a, 0xff8ad0, 0xc03ae0, 0xffd0d0], 12, { spread: 18, speed: 170, gravity: 240, life: 800 });
        b.fx.sparks(p.x + f * 40, p.y - 2, 0xff9a9a, 10, f === 1 ? 0 : Math.PI, 0.35, 360, 300, 0);
        p.afterimage(0xff6a6a);
        b.fx.shake(0.7);
        box(b, 0, 80, 22, 2, b.skillBase({ str: 0.8 }), { vuln: [0.25, 6], knock: 110 });
      }
      break;
    case 'waves': {
      // 검기 난무: 위아래로 번갈아 휘두를 때마다 검기가 날아간다.
      const dy = [-12, 6, -4, 12][index % 4];
      b.fx.slash(p.x + f * 10, p.y + dy * 0.5, f, 26, 0x9fdcff, false, { up: index % 2 === 1, rot: dy * 0.02, speed: 1.6, stretch: 1.35, squash: 0.85 });
      if (index % 2 === 0) b.fx.sparks(p.x + f * 30, p.y + dy, index % 4 ? 0xc080ff : 0x8fe0ff, 3, f === 1 ? 0 : Math.PI, 0.5, 240, 220, 0);
      b.spawnPlayerBolt({ x: p.x + f * 14, y: p.y + dy, vx: f * 340, vy: 0, damage: b.skillBase({ str: 4.0 }), kind: 'wave', pierce: true, life: 0.8, size: 1.7, color: index % 3 === 0 ? 0x8fe0ff : index % 3 === 1 ? 0xc080ff : 0x7fffd0 });
      crescent(b, p.x + f * 8, p.y + dy * 0.5, f, 44, [PAL.sky, PAL.violet, PAL.aurora][index % 3], { from: index % 2 ? 1.2 : -1.2, to: index % 2 ? -1.0 : 1.0, ms: 200 });
      if (index % 3 === 0) wisps(b, p.x + f * 20, p.y + dy, [PAL.sky, PAL.violet, PAL.aurora][(index / 3) % 3], 2, 70, 300, { angle: f === 1 ? 0 : Math.PI, cone: 0.5, curl: 1.6, width: 4 });
      if (index % 2 === 0) twinkles(b, p.x + f * 50, p.y + dy, 26, [0x8fe0ff, 0xc080ff, 0x7fffd0][index % 3], 2, 160);
      break;
    }
    // ─── 도객 초식 ───
    case 'crescent':
      // 만월: 앞뒤로 크게 휘두른 뒤, 둥근 달을 그리며 마무리한다.
      if (index < 2) {
        const dir = (index === 0 ? f : -f) as 1 | -1;
        b.fx.slash(p.x + dir * 6, p.y - 2, dir, 54, 0xff9a6a, true, { up: index === 1, style: 'moon', stretch: 1.3 });
        b.fx.sparks(p.x + dir * 60, p.y - 2, 0xffb080, 6, dir === 1 ? 0 : Math.PI, 0.9, 230, 320);
        p.afterimage(0xffa040);
        b.fx.burst(p.x + dir * 30, p.y - 2, 0xffb080, 6, 110, 300);
        crescent(b, p.x, p.y - 4, dir, 90, index ? PAL.rose : PAL.moon, { from: index === 1 ? 1.5 : -1.5, to: index === 1 ? -1.4 : 1.4, ms: 320 });
        flutter(b, p.x + dir * 60, p.y - 4, 'star', [0xffe070, 0xff8ad0, 0xfff0d0], 4, { spread: 26, speed: 60, life: 600 });
        around(b, 160, 64, 2, b.skillBase({ str: 0.7 }), { knock: 60 });
      } else {
        b.fx.slash(p.x, p.y - 2, 1, 60, 0xffc08a, true, { style: 'moon', stretch: 1.2 });
        b.fx.slash(p.x, p.y - 2, -1, 60, 0xffc08a, true, { up: true, style: 'moon', stretch: 1.2 });
        pop(b, p.x, p.y - 4, 0xfff0d0, 3.4);
        twinkles(b, p.x, p.y - 10, 90, 0xfff0d0, 8, 420);
        b.fx.sparks(p.x, p.y - 4, 0xffc08a, 14, 0, Math.PI, 280, 420);
        b.fx.ring(p.x, p.feet, 100, 0xff9a6a, 400);
        b.fx.burst(p.x, p.y - 4, 0xffd0a0, 18, 170, 420);
        // 둥근 보름달: 앞뒤 거대한 초승달이 겹쳐 원을 그린다.
        // 한쪽은 주황, 한쪽은 장밋빛 달: 두 색이 맞물려 보름달이 된다.
        crescent(b, p.x, p.y - 4, 1, 110, PAL.moon, { from: -1.6, to: 1.6, ms: 420 });
        crescent(b, p.x, p.y - 4, -1, 110, PAL.rose, { from: 1.6, to: -1.6, ms: 420 });
        wisps(b, p.x, p.y - 4, PAL.moon, 8, 140, 560, { curl: 2.8, width: 7 });
        flutter(b, p.x, p.y - 8, 'star', [0xffe070, 0xff8ad0, 0xfff0d0, 0xffa040], 16, { spread: 70, spreadY: 40, speed: 80, life: 1000, within: 300 });
        afterglow(b, p.x, p.feet, 220, PAL.moon, 'star', 1000);
        flare(b, p.x, p.y - 4, 70, PAL.moon, 360);
        shockwave(b, p.x, p.feet, 220, PAL.moon, 520);
        rays(b, p.x, p.y - 4, 14, 150, PAL.moon);
        b.fx.shake(1.1);
        around(b, 160, 64, 2, b.skillBase({ str: 0.8 }), { knock: 130 });
      }
      break;
    case 'skyfall':
      // 낙월: 뛰어오르며 올려 베고, 달이 떨어지듯 내려찍는다.
      if (index === 0) {
        if (p.grounded) p.body.setVelocityY(-260);
        b.fx.slash(p.x + f * 6, p.y - 22, f, 42, 0xc8b0ff, true, { up: true, style: 'moon', squash: 1.25 });
        b.fx.sparks(p.x + f * 20, p.y - 20, 0xd8c8ff, 8, -Math.PI / 2, 0.5, 300, 420, 200);
        p.afterimage(0xc8b0ff);
        b.fx.embers(p.x, p.feet, 0xd8c8ff, 8, 10, 40);
        crescent(b, p.x, p.y - 26, f, 70, PAL.violet, { from: 1.5, to: -1.6, ms: 300 });
        wisps(b, p.x, p.feet - 6, PAL.violet, 4, 110, 420, { angle: -Math.PI / 2, cone: 0.5, curl: 1.6, width: 5 });
        flutter(b, p.x, p.y - 20, 'star', hues(PAL.violet), 6, { spread: 14, spreadY: 30, speed: 70, life: 700 });
        box(b, 0, 56, 116, 36, b.skillBase({ str: 0.8 }), { knock: 20 });
      } else {
        p.body.setVelocityY(520);
        const gy = b.floorY();
        b.fx.slash(p.x + f * 8, p.y - 6, f, 50, 0xc8b0ff, true, { rot: 0.35, style: 'moon', squash: 1.2 });
        b.fx.sparks(p.x + f * 24, gy - 4, 0xd8c8ff, 14, -Math.PI / 2, 1.2, 320, 520, 520);
        twinkles(b, p.x + f * 24, gy - 50, 60, 0xffe0ff, 6, 400);
        p.afterimage(0xc8b0ff);
        b.fx.ring(p.x + f * 20, gy, 90, 0xc8b0ff, 380);
        b.fx.boom(p.x + f * 24, gy - 10, 24, 'dark');
        for (let i = -2; i <= 2; i++) b.fx.smoke(p.x + f * 24 + i * 14, gy - 4, 1, 0x9a8aa8, -10);
        // 달이 떨어진 자리: 보랏빛 폭발과 땅을 타는 충격파
        impactBurst(b, p.x + f * 24, gy - 14, 70, PAL.violet, gy);
        column(b, p.x + f * 24, gy, 30, 260, PAL.violet, 520);
        tint(b, 0x7a2aff, 0.15, 300);
        // 달이 부서진 자리: 분홍·남색 결이 땅을 타고 번지고 별 부스러기가 튀어 오른다.
        shockwave(b, p.x + f * 24, gy, 150, PAL.rose, 520, 0.28, 5);
        wisps(b, p.x + f * 24, gy - 4, PAL.violet, 7, 110, 520, { angle: -Math.PI / 2, cone: 1.4, curl: 2.6, width: 6 });
        flutter(b, p.x + f * 24, gy - 10, 'star', hues(PAL.violet), 16, { spread: 30, spreadY: 8, speed: 220, cone: 1.2, gravity: 260, life: 900 });
        afterglow(b, p.x + f * 24, gy, 170, PAL.violet, 'star', 1000);
        b.fx.shake(1.4);
        box(b, 0, 70, 90, -6, b.skillBase({ str: 2.0 }), { stun: 1.0, knock: 90 });
      }
      break;
    case 'hamstring':
      // 연환각: 바닥을 쓸 듯 낮게 세 번 벤다.
      b.fx.slash(p.x + f * 12, p.y + 10, f, 30, 0x8fe0ff, false, { squash: 0.5, up: index === 1, rot: 0.15, speed: 1.4, style: 'steel', stretch: 1.5 });
      b.fx.sparks(p.x + f * 50, p.feet - 6, 0x8fe0ff, 5, f === 1 ? -0.35 : Math.PI + 0.35, 0.45, 240, 280, 300);
      b.fx.smoke(p.x + f * 24, p.feet - 4, 1, 0x9a8a70, -6);
      crescent(b, p.x + f * 10, p.y + 10, f, 70, index === 1 ? PAL.aurora : PAL.frost, { from: -0.9, to: 1.0, ms: 220, squash: 0.35 });
      flutter(b, p.x + f * 50, p.feet - 8, 'snow', [0xb8ffe8, 0x9ff0ff, 0xc8b0ff, 0xffffff], 4, { spread: 20, spreadY: 6, speed: 90, cone: 1.0, gravity: 60, life: 700 });
      glow(b, p.x + f * 46, p.feet - 2, 60, 0x6a4aff, 300, 0.5, 0.4);
      if (index === 2) {
        shockwave(b, p.x + f * 40, p.feet, 120, PAL.frost, 380);
        wisps(b, p.x + f * 40, p.feet - 4, PAL.frost, 5, 80, 420, { angle: f === 1 ? -0.5 : Math.PI + 0.5, cone: 0.9, curl: 2.4 });
        afterglow(b, p.x + f * 46, p.feet, 130, PAL.frost, 'snow', 800);
      }
      p.body.setVelocityX(f * 70);
      box(b, 0, 64, 30, -8, b.skillBase({ str: index === 2 ? 0.8 : 0.6 }), { slow: [0.5, 4], knock: index === 2 ? 60 : 20 });
      break;
    case 'iai':
      if (index === 0) performIai(b);
      else iaiAftershock(b, index);
      break;
    case 'manaball':
      manaCombo(b, p.combo || 1, base);
      break;
    case 'volley': {
      sfx.play('arrow');
      const m = p.muzzle();
      b.fx.spark(m.x, m.y, 0x9fdcff);
      const ang = (Math.random() - 0.5) * 0.12;
      const s = p.shotPoint();
      b.spawnPlayerBolt({
        x: s.x,
        y: s.y,
        from: m,
        vx: f * Math.cos(ang) * 420,
        vy: Math.sin(ang) * 420,
        damage: b.skillBase({ dex: 1.0, str: 1.0 }),
        kind: 'arrow',
        color: [0x9fdcff, 0xc080ff, 0x7fffd0][index % 3],
        size: 1.4,
        pierce: true,
      });
      flare(b, m.x, m.y, 14, [PAL.arcane, PAL.violet, PAL.aurora][index % 3], 140);
      if (index % 3 === 0) wisps(b, m.x, m.y, [PAL.arcane, PAL.violet, PAL.aurora][(index / 3) % 3], 2, 60, 300, { angle: f === 1 ? 0 : Math.PI, cone: 0.7, curl: 2.2, width: 4 });
      if (index % 2) flutter(b, m.x + f * 8, m.y, 'star', [0x9fdcff, 0xc080ff, 0x7fffd0, 0xff8ae0], 2, { spread: 6, speed: 60, life: 480 });
      b.fx.pop(m.x + f * 5, m.y, [0x9fdcff, 0xc080ff, 0x7fffd0][index % 3], 0.9, 0.45);
      b.fx.sparks(m.x, m.y, [0x9fdcff, 0xc080ff, 0x7fffd0][index % 3], 3, f === 1 ? 0 : Math.PI, 0.5, 240, 200, 0);
      break;
    }
    case 'rapid':
      gunShot(b, 0.8, 0.04);
      // 발마다 총구 불빛의 색이 바뀐다: 불꽃 → 금 → 장미.
      flare(b, p.muzzle().x, p.muzzle().y, 16, [PAL.flame, PAL.gold, PAL.rose][index % 3], 140);
      glow(b, p.muzzle().x + f * 6, p.muzzle().y, 40, [0xff3a6a, 0xffa020, 0xc03ae0][index % 3], 180, 0.5);
      b.fx.sparks(p.muzzle().x, p.muzzle().y, [0xffa020, 0xffe85a, 0xff8ad0][index % 3], 4, f === 1 ? 0 : Math.PI, 0.5, 300, 220, 80);
      break;
    case 'barrage':
      gunShot(b, 0.6, 0.18);
      flare(b, p.muzzle().x, p.muzzle().y, 14, [PAL.flame, PAL.gold, PAL.rose, PAL.violet][index % 4], 120);
      if (index % 3 === 0) glow(b, p.muzzle().x + f * 6, p.muzzle().y, 46, [0xff3a6a, 0xffa020, 0xc03ae0, 0x5a3aff][(index / 3) % 4], 200, 0.5);
      if (index % 6 === 0) shards(b, p.muzzle().x, p.muzzle().y, [PAL.flame, PAL.rose][(index / 6) % 2], 6, 160, 260);
      if (index % 5 === 0) wisps(b, p.muzzle().x, p.muzzle().y, [PAL.flame, PAL.rose][(index / 5) % 2], 2, 50, 260, { angle: f === 1 ? 0 : Math.PI, cone: 0.8, curl: 2.2, width: 4 });
      break;
    case 'snipe': {
      const m = p.muzzle();
      const s = p.shotPoint();
      b.hitscan(s.x, s.y, p.facing === 1 ? 0 : Math.PI, 600, base * 6, { pierce: true, color: 0xfff0a0, width: 4, from: m });
      b.fx.muzzle(m.x, m.y, p.facing, 2);
      // 화면을 꿰뚫는 굵은 빛줄기와 총구 섬광
      b.fx.bigSlash(m.x, m.y, s.x + p.facing * 600, s.y, 0xffd040, 12, 420);
      // 금빛 탄도 둘레로 다홍 빛이 번지고, 총구에서는 반동의 결이 뒤로 말려 나간다.
      b.fx.bigSlash(m.x, m.y - 3, s.x + p.facing * 600, s.y - 5, 0xff3a6a, 3, 300);
      b.fx.bigSlash(m.x, m.y + 3, s.x + p.facing * 600, s.y + 5, 0xff9a3a, 3, 300);
      wisps(b, m.x, m.y, PAL.sun, 6, 90, 460, { angle: p.facing === 1 ? Math.PI : 0, cone: 1.1, curl: 2.4, width: 6 });
      glow(b, m.x + p.facing * 20, m.y, 120, 0xff3a5a, 420, 0.6);
      flutter(b, m.x + p.facing * 200, s.y, 'star', [0xfff0a0, 0xffa0c8, 0xffd040], 10, { spread: 190, spreadY: 6, speed: 40, life: 700, within: 200 });
      flare(b, m.x, m.y, 44, PAL.gold, 300);
      rays(b, m.x, m.y, 12, 110, PAL.gold, 360);
      shockwave(b, m.x, m.y, 80, PAL.gold, 360, 1, 5);
      b.fx.pop(m.x + p.facing * 10, m.y, 0xfff6c0, 2.6, 0.45);
      b.fx.sparks(m.x, m.y, 0xffd040, 16, p.facing === 1 ? 0 : Math.PI, 0.5, 420, 360, 100);
      for (let i = 1; i <= 5; i++) b.fx.pop(m.x + p.facing * i * 90, m.y + ((s.y - m.y) * i) / 6.5, [0xfff0a0, 0xffa0c8, 0xff9a3a][i % 3], 1.2 - i * 0.12, 0.4);
      twinkles(b, s.x + p.facing * 200, s.y, 180, 0xfff6c0, 6, 300);
      b.fx.casing(p.x + p.facing * 8, p.y - 8, p.facing, p.feet);
      b.fx.shake(1);
      break;
    }
    default:
      break;
  }
}

/** 발도: 앞으로 순간 돌진하며 경로의 적을 벤다. 지나간 길은 iaiPath에 남겨 뒤따르는 칼바람이 쓴다. */
function performIai(b: BattleScene): void {
  const p = b.player;
  const len = 170;
  const f = p.facing;
  const x0 = f === 1 ? p.x : p.x - len;
  iaiPath = { x0, len, y: p.y };
  b.hitArea(x0, p.y - 26, len, 52, b.skillBase({ str: 1.0 }), { knock: 20 });
  // 지나간 자리: 하얀 섬광 선과 잔상
  b.fx.streak(p.x + f * len, p.y - 2, f === 1 ? 0 : Math.PI, len + 20, 0xffe2c4, 320, 2);
  b.fx.streak(p.x + f * len, p.y + 4, f === 1 ? 0 : Math.PI, len, 0xffffff, 180, 1);
  for (let i = 0; i <= 8; i++) {
    const ix = p.x + (f * (i * len)) / 8;
    b.fx.burst(ix, p.y - 2, 0xffe2c4, 1, 40, 260);
    b.fx.sparks(ix, p.y - 2, 0xffe2c4, 2, f === 1 ? Math.PI : 0, 0.5, 160, 260, 120);
  }
  // 떠난 자리에 남는 잔상
  p.afterimage(0xffb070);
  // 지나간 길을 따라 벚꽃잎이 흩날린다.
  flutter(b, p.x + (f * len) / 2, p.y - 6, 'petal', hues(PAL.sakura), 16, { spread: len / 2, spreadY: 10, speed: 50, angle: f === 1 ? Math.PI : 0, cone: 0.9, gravity: 45, sway: 16, life: 1300, within: 160 });
  glow(b, p.x + (f * len) / 2, p.y - 2, len * 0.6, 0xc03ae0, 420, 0.45, 0.4);
  b.fx.bigSlash(p.x, p.y - 6, p.x + f * (len + 10), p.y - 4, 0xff8ad0, 3, 260);
  pop(b, p.x + f * len, p.y - 2, 0xfff0d0, 2);
  twinkles(b, p.x + (f * len) / 2, p.y - 6, 60, 0xfff0d0, 5, 300);
  b.fx.bigSlash(p.x, p.y - 2, p.x + f * (len + 30), p.y - 2, 0xffb070, 10, 300);
  flare(b, p.x + f * len, p.y - 2, 34, PAL.moon, 260);
  p.zone.x += f * len;
  p.invuln = Math.max(p.invuln, 0.35);
  b.fx.stop(0.06);
}

/** 발도 직후 지나간 길에 칼바람이 몰아친다. 마지막 바람은 화면을 가른다. */
function iaiAftershock(b: BattleScene, index: number): void {
  const path = iaiPath;
  if (!path) return;
  const x = path.x0 + path.len * (0.15 + Math.random() * 0.7);
  const dir = (Math.random() < 0.5 ? 1 : -1) as 1 | -1;
  b.fx.slash(x, path.y - 2, dir, 30 + Math.random() * 10, 0xffe2c4, false, { rot: (Math.random() - 0.5) * 1.6, up: Math.random() < 0.5, speed: 1.5, style: 'steel', stretch: 1.6, squash: 0.7 });
  b.fx.cut(x, path.y - 2, (Math.random() - 0.5) * 2.4, 70 + Math.random() * 50, [0xffe2c4, 0xffb0d0, 0xff8ad0, 0xffe0a0][index % 4]);
  b.fx.spark(x, path.y - 2, 0xffe2c4, 1, Math.random());
  flutter(b, x, path.y - 4, 'petal', hues(PAL.sakura), 5, { spread: 20, spreadY: 12, speed: 90, gravity: 50, sway: 16, life: 1100 });
  const last = index === 4;
  b.hitArea(path.x0, path.y - 26, path.len, 52, b.skillBase({ str: 1.0 }), { knock: last ? 80 : 10 });
  if (last) {
    b.fx.slash(path.x0 + path.len / 2, path.y - 2, 1, path.len * 0.55, 0xffffff, true, { squash: 0.35, style: 'steel' });
    b.fx.cut(path.x0 + path.len / 2, path.y - 2, 0, path.len * 1.5, 0xffe2c4);
    twinkles(b, path.x0 + path.len / 2, path.y - 8, path.len * 0.5, 0xffffff, 8, 360);
    b.fx.flashScreen(0xffe2c4, 0.28, 180);
    crescent(b, path.x0 + path.len / 2, path.y - 2, 1, path.len * 0.7, PAL.sakura, { from: -2.6, to: 2.6, ms: 420, squash: 0.35 });
    rays(b, path.x0 + path.len / 2, path.y - 2, 14, 140, PAL.moon);
    // 마지막 칼바람: 꽃잎이 한꺼번에 터져 오르고 분홍 결이 길을 휩쓴다.
    wisps(b, path.x0 + path.len / 2, path.y - 2, PAL.sakura, 8, path.len * 0.6, 560, { curl: 2.2, width: 6 });
    flutter(b, path.x0 + path.len / 2, path.y - 6, 'petal', hues(PAL.sakura), 26, { spread: path.len * 0.5, spreadY: 16, speed: 150, cone: 1.2, gravity: 40, sway: 18, life: 1500, within: 120 });
    afterglow(b, path.x0 + path.len / 2, b.floorY(), path.len, PAL.sakura, 'petal', 1000);
    b.fx.shake(0.9, 160);
    b.fx.stop(0.08);
    iaiPath = null;
  }
}

export function updateLaser(b: BattleScene, dt: number): void {
  b.setBeam(true);
  combatState.laserTick -= dt;
  if (combatState.laserTick > 0) return;
  combatState.laserTick = 0.1;
  const p = b.player;
  const m = p.muzzle();
  // 광선은 손 높이에서 나가므로, 선 하나로 판정하면 키 작은 적(고양이·늑대 등)을 지나친다.
  // 보이는 광선 굵기만큼의 띠로 판정한다.
  const len = 380;
  flare(b, m.x, m.y, 18, PAL.arcane, 160);
  const x0 = p.facing === 1 ? m.x : m.x - len;
  b.hitArea(x0, m.y - LASER_HALF_H, len, LASER_HALF_H * 2, b.skillBase({ int: 0.5 }), { quiet: true, knock: 30 });
}

/** 저격 조준: 붉은 조준선이 깜빡이고 총구로 빛이 모인다. */
export function snipeSight(b: BattleScene): void {
  const p = b.player;
  const g = b.add.graphics().setDepth(DEPTH.fx).setBlendMode(Phaser.BlendModes.ADD);
  let t = 0;
  const ev = b.time.addEvent({
    delay: 16,
    loop: true,
    callback: () => {
      t += 16;
      g.clear();
      if (p.action?.kind !== 'snipe' || t > 600) {
        ev.remove();
        g.destroy();
        return;
      }
      const m = p.muzzle();
      // 조준선은 총알이 실제로 날아갈 높이에 긋는다.
      const s = p.shotPoint();
      g.lineStyle(1, 0xff3a2a, 0.35 + 0.35 * Math.sin(t * 0.04)).lineBetween(s.x, s.y, s.x + p.facing * 600, s.y);
      if (Math.random() < 0.5) {
        const a = Math.random() * Math.PI * 2;
        const dot = b.add.image(m.x + Math.cos(a) * 14, m.y + Math.sin(a) * 14, 'fx-px').setTint(0xfff0a0).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.fx);
        b.tweens.add({ targets: dot, x: m.x, y: m.y, alpha: 0.2, duration: 160, onComplete: () => dot.destroy() });
      }
    },
  });
}
