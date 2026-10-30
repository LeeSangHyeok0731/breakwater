import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';

/**
 * 타락한 엘프 (원거리 군단장). 석궁으로 쉴 새 없이 쏜다.
 * 일반 패턴: 3연사, 부채꼴 난사, 화살비, 조준 저격, (가까이 붙으면) 뒤로 도약하며 공중 사격.
 * 패턴이 하나 끝날 때마다 석궁이 파랗게 빛나고 파란 화살을 쏜다.
 * 가드키로 패링하면 화살이 되돌아가 엘프가 무너지고(그로기) 모든 피해를 200%로 받는다.
 * 체력 50% 아래: 더 빨라지고, 연사·부채꼴·화살비의 화살이 늘어난다.
 */

const BLUE = 0x4ab0ff;
const BLUE_HI = 0xc8f0ff;
const CORRUPT = 0x7aff9a;
const BOW_KEY = 'elf-crossbow';
const BOLT_KEY = 'elf-bolt';

/** 석궁을 쥔 손 (발끝 기준, 오른쪽을 볼 때) */
const HAND = { x: 12, y: -52 };
/** 그로기 시간 (기믹 완화를 고르면 1.5배) */
const GROGGY = 5;

type Pattern = 'burst' | 'fan' | 'rain' | 'snipe' | 'backstep' | 'blue';

interface ElfState {
  pattern: Pattern | null;
  t: number;
  fired: Set<number>;
  last: Pattern | null;
  bow: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  aim: Phaser.GameObjects.Graphics;
  /** 석궁이 겨누는 각도 */
  angle: number;
  /** 저격·파란 화살: 마지막 순간에 고정한 각도 */
  locked: number | null;
  from: number;
  to: number;
  /** 다음에 파란 화살을 쏠 차례 */
  blueNext: boolean;
}

const states = new WeakMap<Monster, ElfState>();

/** 석궁 그림 (오른쪽을 향함): 검보라 개머리, 은빛 활대, 초록 독이 묻은 볼트 */
function makeArt(scene: Phaser.Scene): void {
  if (!scene.textures.exists(BOW_KEY)) {
    const c = document.createElement('canvas');
    c.width = 22;
    c.height = 16;
    const g = c.getContext('2d')!;
    const px = (x: number, y: number, w: number, h: number, color: string): void => {
      g.fillStyle = color;
      g.fillRect(x, y, w, h);
    };
    // 개머리와 몸통
    px(0, 7, 16, 4, '#120c18');
    px(1, 8, 14, 2, '#4a2a5a');
    px(1, 8, 14, 1, '#7a4a8a');
    px(2, 10, 4, 4, '#120c18');
    px(3, 10, 2, 3, '#3a1a4a');
    // 활대 (앞쪽 세로)
    px(14, 1, 3, 14, '#120c18');
    px(15, 2, 1, 12, '#c8c8e0');
    px(13, 0, 2, 2, '#120c18');
    px(13, 14, 2, 2, '#120c18');
    // 시위
    for (let y = 2; y < 14; y++) px(13 - Math.round(Math.abs(y - 8) * 0.0), y, 1, 1, y === 8 ? '#e8e0ff' : '#8a8aa8');
    // 장전된 볼트와 독
    px(8, 8, 13, 1, '#d8d8e8');
    px(19, 7, 3, 3, '#3a6a4a');
    px(20, 8, 2, 1, '#7aff9a');
    // 개머리 보석
    px(4, 8, 2, 1, '#7aff9a');
    scene.textures.addCanvas(BOW_KEY, c);
  }
  if (!scene.textures.exists(BOLT_KEY)) {
    const c = document.createElement('canvas');
    c.width = 14;
    c.height = 5;
    const g = c.getContext('2d')!;
    g.fillStyle = '#120c18';
    g.fillRect(0, 1, 14, 3);
    g.fillStyle = '#ffffff';
    g.fillRect(1, 2, 10, 1);
    g.fillRect(11, 1, 2, 3);
    g.fillRect(13, 2, 1, 1);
    g.fillRect(0, 0, 3, 1);
    g.fillRect(0, 4, 3, 1);
    scene.textures.addCanvas(BOLT_KEY, c);
  }
}

/** 석궁 볼트 한 발: 직선으로 날아가 플레이어에 닿으면 피해 */
function shoot(m: Monster, x: number, y: number, ang: number, speed: number, damage: number, tint: number, scale = 2): void {
  const b = m.scene;
  const W = b.level.width;
  const img = b.add.image(x, y, BOLT_KEY).setRotation(ang).setScale(scale).setTint(tint).setDepth(DEPTH.projectile);
  const trail = b.fx.streak(x, y, ang, 26, tint, 0, 1);
  const dist = 900;
  let hit = false;
  b.tweens.add({
    targets: img,
    x: x + Math.cos(ang) * dist,
    y: y + Math.sin(ang) * dist,
    duration: (dist / speed) * 1000,
    onUpdate: () => {
      trail.setPosition(img.x, img.y);
      if (hit) return;
      if (img.y > FLOOR_Y + 4 || img.x < -40 || img.x > W + 40) {
        hit = true;
        b.fx.spark(img.x, Math.min(img.y, FLOOR_Y - 2), tint, 1);
        img.destroy();
        trail.destroy();
        return;
      }
      const pb = b.player.body;
      if (img.x > pb.x - 4 && img.x < pb.right + 4 && img.y > pb.y && img.y < pb.bottom) {
        hit = true;
        b.damagePlayer(damage, { x: m.x, monster: m, melee: false });
        b.fx.spark(img.x, img.y, tint, 1);
        img.destroy();
        trail.destroy();
      }
    },
    onComplete: () => {
      img.destroy();
      trail.destroy();
    },
  });
}

/** 파란 화살: 패링하면 엘프에게 되돌아가 그로기, 못 막으면 큰 피해 */
function blueBolt(m: Monster, x: number, y: number, ang: number): void {
  const b = m.scene;
  const p = b.player;
  const img = b.add.image(x, y, BOLT_KEY).setRotation(ang).setScale(3).setTint(BLUE_HI).setDepth(DEPTH.projectile + 1);
  const halo = b.add.circle(x, y, 10, BLUE, 0.45).setDepth(DEPTH.projectile).setBlendMode(Phaser.BlendModes.ADD);
  let done = false;
  const speed = 360;
  const dist = 900;
  sfx.play('arrow', 0.6);
  const tween = b.tweens.add({
    targets: [img, halo],
    x: x + Math.cos(ang) * dist,
    y: y + Math.sin(ang) * dist,
    duration: (dist / speed) * 1000,
    onUpdate: () => {
      if (done) return;
      if (Math.random() < 0.6) b.fx.burst(img.x, img.y, BLUE, 1, 30, 260);
      if (img.y > FLOOR_Y + 4) {
        done = true;
        b.fx.burst(img.x, FLOOR_Y - 4, BLUE, 8, 90, 300);
        img.destroy();
        halo.destroy();
        return;
      }
      const pb = p.body;
      if (img.x < pb.x - 8 || img.x > pb.right + 8 || img.y < pb.y - 6 || img.y > pb.bottom + 6) return;
      done = true;
      tween.stop();
      const front = (img.x - p.x) * p.facing >= -6;
      if (p.parryTimer > 0 && front) {
        // 패링 성공: 화살이 엘프에게 되돌아간다.
        sfx.play('parry');
        b.fx.stop(0.12);
        b.fx.flashScreen(BLUE, 0.35, 260);
        b.fx.burst(img.x, img.y, BLUE_HI, 16, 180, 420);
        b.fx.text(p.x, p.body.top - 14, '패링!', 'heal');
        p.mp = Math.min(p.derived.maxMp, p.mp + 20);
        halo.destroy();
        img.setRotation(Math.atan2(m.y - img.y, m.x - img.x));
        b.tweens.add({
          targets: img,
          x: m.x,
          y: m.y,
          duration: 180,
          onComplete: () => {
            img.destroy();
            groggy(m);
          },
        });
        return;
      }
      img.destroy();
      halo.destroy();
      if (p.invuln > 0) return;
      b.damagePlayer(m.damage * 1.8, { x: m.x, monster: m, melee: false, unblockable: true });
      b.fx.burst(p.x, p.y, BLUE, 12, 140, 360);
    },
    onComplete: () => {
      img.destroy();
      halo.destroy();
    },
  });
}

/** 패링당한 엘프: 무릎 꿇고(멈춤) 받는 피해 200% */
function groggy(m: Monster): void {
  const b = m.scene;
  const time = GROGGY * (b.legion?.mods.includes('gimmick') ? 1.5 : 1);
  m.stun = time;
  m.vuln = Math.max(m.vuln, 1);
  m.vulnTime = time;
  m.body.setVelocity(0, 0);
  b.legionGroggy = time;
  b.announce('패링 성공! 엘프가 무너졌다', 1.2);
  b.fx.shake(1.2, 240);
  b.fx.boom(m.x, m.y, 30, 'arcane');
  b.fx.ring(m.x, FLOOR_Y, 80, BLUE, 420);
  const st = states.get(m);
  if (st) {
    st.pattern = null;
    st.glow.setVisible(false);
    st.aim.clear();
  }
}

function once(st: ElfState, step: number, at: number): boolean {
  if (st.t < at || st.fired.has(step)) return false;
  st.fired.add(step);
  return true;
}

/** 석궁 끝 (볼트가 나가는 곳) */
function muzzle(st: ElfState): { x: number; y: number } {
  return { x: st.bow.x + Math.cos(st.angle) * 26, y: st.bow.y + Math.sin(st.angle) * 26 };
}

function aimAt(m: Monster, st: ElfState, dt: number, turn = 6): void {
  const p = m.scene.player;
  const want = Math.atan2(p.y - 4 - st.bow.y, p.x - st.bow.x);
  const diff = Phaser.Math.Angle.Wrap(want - st.angle);
  st.angle += Phaser.Math.Clamp(diff, -turn * dt, turn * dt);
}

function begin(m: Monster, st: ElfState, pattern: Pattern): void {
  st.pattern = pattern;
  st.t = 0;
  st.fired.clear();
  st.locked = null;
  m.body.setVelocityX(0);
  m.play(m.look.idle);
  const b = m.scene;
  const W = b.level.width;
  if (pattern === 'backstep') {
    st.from = m.x;
    st.to = Phaser.Math.Clamp(m.x + (m.x >= b.player.x ? 1 : -1) * 230, 50, W - 50);
    if (Math.abs(st.to - st.from) < 120) st.to = Phaser.Math.Clamp(m.x + (m.x >= b.player.x ? -1 : 1) * 260, 50, W - 50);
  }
}

function choose(m: Monster, st: ElfState): Pattern {
  const p = m.scene.player;
  if (st.blueNext) return 'blue';
  if (Math.abs(p.x - m.x) < 150) return 'backstep';
  const pool = (['burst', 'fan', 'rain', 'snipe', 'burst'] as Pattern[]).filter((x) => x !== st.last);
  return pool[Math.floor(Math.random() * pool.length)];
}

function syncBow(m: Monster, st: ElfState): void {
  const s = m.sprite;
  const f = Math.cos(st.angle) >= 0 ? 1 : -1;
  m.face(f);
  const hx = s.x + m.facing * HAND.x;
  const hy = s.y + HAND.y;
  st.bow.setPosition(hx, hy).setRotation(st.angle).setFlipY(f === -1);
  st.glow.setPosition(hx, hy).setRotation(st.angle).setFlipY(f === -1);
}

export const corruptedElf: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  let st = states.get(m);
  if (!st) {
    makeArt(b);
    const bow = b.add.image(m.x, m.y, BOW_KEY).setOrigin(0.3, 0.6).setScale(2).setDepth(DEPTH.monster + 1);
    const glow = b.add.image(m.x, m.y, BOW_KEY).setOrigin(0.3, 0.6).setScale(2.5).setDepth(DEPTH.monster).setTint(BLUE).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    const aim = b.add.graphics().setDepth(DEPTH.fx);
    st = { pattern: null, t: 0, fired: new Set(), last: null, bow, glow, aim, angle: Math.PI, locked: null, from: 0, to: 0, blueNext: false };
    states.set(m, st);
    const hide = (): void => {
      if (m.alive) return;
      b.tweens.add({ targets: [bow, glow], alpha: 0, duration: 400 });
      aim.clear();
      b.events.off('postupdate', hide);
    };
    b.events.on('postupdate', hide);
    b.events.once('shutdown', () => {
      b.events.off('postupdate', hide);
      bow.destroy();
      glow.destroy();
      aim.destroy();
    });
    m.attackTimer = 1.4;
  }
  if (!m.phase2 && m.hp / m.maxHp < 0.5) {
    m.phase2 = true;
    b.announce('타락한 엘프의 눈이 독기로 번뜩인다!');
    b.fx.flashScreen(CORRUPT, 0.25, 300);
  }
  const pace = b.legionPace(m) * (m.phase2 ? 0.8 : 1);
  const body = m.body;
  st.aim.clear();
  let done = false;

  if (!st.pattern) {
    // 거리를 벌린 채 좌우로 움직이며 겨눈다.
    const dx = p.x - m.x;
    const want = Math.abs(dx) < 220 ? -Math.sign(dx) : Math.abs(dx) > 340 ? Math.sign(dx) : 0;
    const W = b.level.width;
    const blocked = (want < 0 && m.x < 70) || (want > 0 && m.x > W - 70);
    body.setVelocityX(blocked ? 0 : want * m.speed * 0.7);
    m.play(want && !blocked ? m.look.walk : m.look.idle);
    aimAt(m, st, dt, 4);
    m.attackTimer -= dt;
    if (m.attackTimer <= 0) begin(m, st, choose(m, st));
    syncBow(m, st);
    return;
  }

  st.t += dt / pace;
  const t = st.t;
  switch (st.pattern) {
    case 'burst': {
      // 짧게 겨누고 세 발씩 연사 (2단계는 두 번)
      body.setVelocityX(0);
      aimAt(m, st, dt, 5);
      const shots = m.phase2 ? [0.5, 0.62, 0.74, 1.15, 1.27, 1.39] : [0.5, 0.62, 0.74];
      if (t < 0.5) {
        const mz = muzzle(st);
        st.aim.lineStyle(1, 0xff4a4a, 0.5).lineBetween(mz.x, mz.y, mz.x + Math.cos(st.angle) * 500, mz.y + Math.sin(st.angle) * 500);
      }
      shots.forEach((at, i) => {
        if (!once(st, i, at)) return;
        const mz = muzzle(st);
        shoot(m, mz.x, mz.y, st.angle, 520, m.damage * 0.45, CORRUPT);
        b.fx.spark(mz.x, mz.y, CORRUPT, 1);
        sfx.play('arrow', 0.9);
      });
      if (t > shots[shots.length - 1] + 0.35) done = true;
      break;
    }
    case 'fan': {
      // 부채꼴로 일곱 발 (2단계 아홉 발)
      body.setVelocityX(0);
      aimAt(m, st, dt, 4);
      if (t < 0.7 && Math.random() < 0.4) b.fx.burst(muzzle(st).x, muzzle(st).y, CORRUPT, 1, 30, 260);
      if (once(st, 0, 0.7)) {
        const n = m.phase2 ? 9 : 7;
        const mz = muzzle(st);
        for (let i = 0; i < n; i++) shoot(m, mz.x, mz.y, st.angle + (i / (n - 1) - 0.5) * 1.0, 420, m.damage * 0.5, CORRUPT);
        b.fx.burst(mz.x, mz.y, CORRUPT, 10, 120, 300);
        b.fx.shake(0.4, 100);
        sfx.play('arrow', 1.2);
      }
      if (t > 1.1) done = true;
      break;
    }
    case 'rain': {
      // 하늘로 쏘아 올린 볼트가 예고한 자리에 쏟아진다.
      body.setVelocityX(0);
      const up = -Math.PI / 2 + (m.facing === 1 ? 0.25 : -0.25);
      st.angle += Phaser.Math.Angle.Wrap(up - st.angle) * Math.min(1, dt * 10);
      if (once(st, 0, 0.45)) {
        const mz = muzzle(st);
        for (let i = 0; i < 3; i++) b.time.delayedCall(i * 90, () => b.fx.streak(mz.x, mz.y, up, 60, CORRUPT, 220, 2));
        sfx.play('arrow', 1.3);
        const W = b.level.width;
        const n = m.phase2 ? 5 : 3;
        const xs = [p.x];
        for (let i = 1; i < n; i++) xs.push(Phaser.Math.Clamp(p.x + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 110, 40, W - 40));
        const delay = 1.0 * pace + b.legionWarnBonus();
        for (const x of xs) {
          b.addTelegraph(x - 36, 0, 72, FLOOR_Y, delay, m, () => {
            for (let k = 0; k < 6; k++) {
              const sx = x - 30 + Math.random() * 60;
              b.time.delayedCall(k * 40, () => {
                b.fx.streak(sx, FLOOR_Y - 120, Math.PI / 2, 120, CORRUPT, 160, 2);
                b.fx.spark(sx, FLOOR_Y - 4, CORRUPT, 1);
              });
            }
            b.fx.burst(x, FLOOR_Y - 6, CORRUPT, 10, 90, 360);
            b.areaHit(x - 36, FLOOR_Y - 140, 72, 140, m.damage * 0.8, m, false);
          });
        }
      }
      if (t > 1.0) done = true;
      break;
    }
    case 'snipe': {
      // 조준선이 플레이어를 따라오다가 마지막 0.25초에 고정 → 아주 빠른 한 발
      body.setVelocityX(0);
      if (t < 1.1) aimAt(m, st, dt, 3);
      else if (st.locked === null) st.locked = st.angle;
      const mz = muzzle(st);
      if (t < 1.35) {
        const locked = st.locked !== null;
        st.aim
          .lineStyle(locked ? 2 : 1, locked ? 0xffffff : 0xff3a2a, locked ? 0.9 : 0.4 + 0.3 * Math.sin(t * 30))
          .lineBetween(mz.x, mz.y, mz.x + Math.cos(st.angle) * 900, mz.y + Math.sin(st.angle) * 900);
      }
      if (once(st, 0, 1.35)) {
        shoot(m, mz.x, mz.y, st.angle, 1100, m.damage * 1.3, 0xffffff, 3);
        b.fx.tracer(mz.x, mz.y, mz.x + Math.cos(st.angle) * 900, mz.y + Math.sin(st.angle) * 900, 0xffffff, 2, 120);
        b.fx.shake(0.6, 120);
        sfx.play('arrow', 0.7);
      }
      if (t > 1.7) done = true;
      break;
    }
    case 'backstep': {
      // 뒤로 높이 도약하며 공중에서 아래로 부채꼴 사격
      const k = Phaser.Math.Clamp(t / 0.7, 0, 1);
      if (k < 1) {
        body.reset(st.from + (st.to - st.from) * k, FLOOR_Y - body.height / 2 - Math.sin(k * Math.PI) * 110);
        body.setVelocity(0, 0);
        m.play('elf:hero-jump');
        aimAt(m, st, dt, 10);
      }
      if (once(st, 0, 0.35)) {
        const mz = muzzle(st);
        for (let i = 0; i < 3; i++) shoot(m, mz.x, mz.y, st.angle + (i - 1) * 0.18, 460, m.damage * 0.5, CORRUPT);
        sfx.play('arrow');
      }
      if (once(st, 1, 0.7)) {
        body.reset(st.to, FLOOR_Y - body.height / 2);
        b.fx.smoke(st.to, FLOOR_Y - 4, 1, 0x6a7a6a, -10);
      }
      if (t > 0.9) done = true;
      break;
    }
    case 'blue': {
      // 석궁이 파랗게 빛난다 → 조준선 → 파란 화살 (패링 기회)
      body.setVelocityX(0);
      if (t < 0.55) aimAt(m, st, dt, 4);
      else if (st.locked === null) st.locked = st.angle;
      st.glow.setVisible(true).setAlpha(0.4 + 0.4 * Math.sin(t * 25));
      const mz = muzzle(st);
      if (t < 0.85) {
        st.aim.lineStyle(2, BLUE, 0.35 + 0.35 * Math.sin(t * 30)).lineBetween(mz.x, mz.y, mz.x + Math.cos(st.angle) * 700, mz.y + Math.sin(st.angle) * 700);
        if (Math.random() < 0.5) b.fx.burst(mz.x, mz.y, BLUE, 1, 40, 260);
      }
      if (once(st, 9, 0)) b.fx.text(m.x, m.body.top - 16, '!', 'crit');
      if (once(st, 0, 0.85)) {
        st.glow.setVisible(false);
        blueBolt(m, mz.x, mz.y, st.angle);
        b.fx.spark(mz.x, mz.y, BLUE_HI, 2);
      }
      if (t > 1.2) done = true;
      break;
    }
  }

  if (done) {
    // 일반 패턴 뒤에는 파란 화살이 온다.
    st.blueNext = st.pattern !== 'blue' && st.pattern !== 'backstep';
    st.last = st.pattern;
    st.pattern = null;
    st.glow.setVisible(false);
    m.attackTimer = (st.blueNext ? 0.3 : 0.6 + Math.random() * 0.5) * pace;
  }
  syncBow(m, st);
};
