import Phaser from 'phaser';
import { sfx } from '../../core/audio';
import type { MonsterKind } from '../../data/monsters';
import type { FieldSpec } from '../battleScene';
import { DRAGON_DEFS, FLAME_Z, WYVERN_Z } from '../dragon/chapter6Art';
import { dragonBoss, EL_FIRE, type DragonElement } from '../dragon/dragonBoss';
import { DEPTH } from '../fx';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { CHAPTER2, hover } from './chapter2';

// 챕터 6(용들의 둥지) 몬스터의 행동. 새끼 용·숭배자·알은 속성만 바꿔 뒤 챕터에서도 쓴다.

/** 속성 장판: 그 위 땅에 서 있으면 틱마다 다친다. */
export function elemFieldAt(m: Monster, el: DragonElement, x: number, w: number, life: number, hurt: number): void {
  const spec: FieldSpec = { x: x - w / 2, w, life, tickEvery: 0.5, damage: 0, color: el.color, style: el.field, hurt };
  m.scene.addField(spec);
}

function resetTint(m: Monster): void {
  const tint = m.elite ? 0xffb070 : m.look.tint;
  if (tint !== undefined) m.sprite.setTint(tint);
  else m.sprite.clearTint();
}

/** 새끼 용이 뱉는 탄: 불은 터지는 불덩이, 서리는 맞으면 느려지는 얼음탄, 번개·그림자는 빠른 구슬 */
function whelpShot(m: Monster, el: DragonElement, ox: number, oy: number, ang: number): void {
  const b = m.scene;
  const v = 170;
  if (el.field === 'fire') b.spawnEnemyBolt(ox, oy, Math.cos(ang) * v, Math.sin(ang) * v, m.damage, m, 24);
  else if (el.field === 'frost') b.spawnEnemyBolt(ox, oy, Math.cos(ang) * v, Math.sin(ang) * v, m.damage, m, 0, { kind: 'frost', slow: true });
  else if (el.pillar === 'light' && el.boom === 'dark') b.spawnEnemyBolt(ox, oy, Math.cos(ang) * v, Math.sin(ang) * v, m.damage, m, 0, { kind: 'void', homing: 0.8, life: 4 });
  else b.spawnEnemyBolt(ox, oy, Math.cos(ang) * v * 1.35, Math.sin(ang) * v * 1.35, m.damage, m, 0, { tint: el.color });
}

// ─── 새끼 용: 날아다니며 탄을 뱉고, 세 번에 한 번은 내리꽂혀 문다 ───
export function whelp(el: DragonElement): Behavior {
  return (m, dt) => {
    const b = m.scene;
    const p = b.player;
    m.stateTime -= dt;
    m.attackTimer -= dt;
    if (Math.random() < 0.08) b.fx.embers(m.x - m.facing * 8, m.y, el.color, 1, 4, 14, 300);
    switch (m.state) {
      case 'move':
        m.play(m.look.walk);
        // 무리가 한 점에 겹치지 않도록 저마다 다른 거리·높이에서 맴돈다.
        if (m.targetX === 0) {
          m.targetX = 100 + Math.random() * 90;
          m.targetY = FLOOR_Y - 100 - Math.random() * 50;
        }
        hover(m, m.targetX, m.targetY, 0.8);
        if (m.attackTimer <= 0 && Math.abs(p.x - m.x) < 320) {
          m.state = 'windup';
          m.stateTime = 0.5;
          m.step = (m.step + 1) % 3;
          m.body.setVelocity(0, -20);
          m.play(m.look.attack);
          m.sprite.setTint(0xffffff).setTintFill(el.hi);
          b.time.delayedCall(80, () => m.alive && resetTint(m));
        }
        break;
      case 'windup':
        m.body.setVelocity(0, -10);
        m.face(p.x - m.x);
        if (m.stateTime > 0) break;
        if (m.step === 0) {
          m.state = 'dive';
          m.stateTime = 0.8;
          m.hitDone = false;
          const ang = Math.atan2(p.y - m.y, p.x - m.x);
          m.body.setVelocity(Math.cos(ang) * 260, Math.sin(ang) * 260);
        } else {
          const ox = m.x + m.facing * 12;
          const oy = m.y + 2;
          const base = Math.atan2(p.y - oy, p.x - ox);
          for (const s of m.elite ? [-0.25, 0, 0.25] : [0]) whelpShot(m, el, ox, oy, base + s);
          b.fx.burst(ox, oy, el.hi, 6, 80, 260);
          sfx.play('magic', 0.4);
          m.state = 'recover';
          m.stateTime = 0.4;
        }
        m.attackTimer = m.def.attackCd * (0.8 + Math.random() * 0.4);
        break;
      case 'dive':
        if (!m.hitDone && Math.abs(p.x - m.x) < 22 && Math.abs(p.y - m.y) < 26) {
          m.hitDone = true;
          b.damagePlayer(m.damage * 1.2, { x: m.x, monster: m, melee: true });
          b.fx.slash(m.x + m.facing * 8, m.y, m.facing, 16, el.hi);
        }
        if (m.stateTime <= 0 || m.body.bottom >= FLOOR_Y - 4) {
          m.state = 'rise';
          m.stateTime = 0.5;
          m.body.setVelocity(0, 0);
        }
        break;
      case 'rise':
        m.body.setVelocity(0, m.stateTime > 0 ? 0 : -110);
        if (m.y < FLOOR_Y - 100) m.state = 'move';
        break;
      default:
        m.body.setVelocity(m.body.velocity.x * 0.9, 0);
        if (m.stateTime <= 0) m.state = 'move';
    }
  };
}

// ─── 숭배자: 거리를 두고, 플레이어 발밑에 낙인을 찍는다. 불·서리는 장판을 남기고, 번개는 벼락이 내리꽂힌다 ───
export function cultist(el: DragonElement): Behavior {
  return (m, dt) => {
    const b = m.scene;
    const p = b.player;
    const { dx, dist } = m.toPlayer();
    m.stateTime -= dt;
    m.attackTimer -= dt;
    if (m.state === 'move') {
      m.play(m.look.walk);
      if (dist > 230) m.walk(Math.sign(dx));
      else if (dist < 130) m.walk(-Math.sign(dx), 0.8);
      else m.walk(0);
      m.face(dx);
      if (m.attackTimer <= 0 && dist < 380) {
        m.state = 'windup';
        m.stateTime = 1.1;
        m.body.setVelocityX(0);
        m.play(m.look.attack);
        const xs = m.elite ? [p.x - 70, p.x + 70] : [p.x];
        for (const x of xs) {
          const cx = Phaser.Math.Clamp(x, 40, b.level.width - 40);
          if (el.pillar === 'light') {
            b.lightBeam(cx, m.damage, m, 1, 40, el.hi);
            continue;
          }
          b.fx.circle(cx, FLOOR_Y - 1, el.color, 70, 1000, false, DEPTH.fx - 2);
          b.addTelegraph(
            cx - 35,
            FLOOR_Y - 46,
            70,
            46,
            1,
            m,
            () => {
              b.fx.boom(cx, FLOOR_Y - 14, 24, el.boom);
              b.fx.burst(cx, FLOOR_Y - 8, el.hi, 12, 140, 400);
              sfx.play('boom', 0.45);
              b.areaHit(cx - 35, FLOOR_Y - 46, 70, 46, m.damage, m, false);
              elemFieldAt(m, el, cx, 70, 3, Math.round(m.damage * 0.3));
            },
            el.color,
          );
        }
      }
      return;
    }
    m.body.setVelocityX(0);
    if (m.stateTime <= 0) {
      m.state = 'move';
      m.attackTimer = m.def.attackCd;
    }
  };
}

// ─── 용암 살쾡이: 지옥 고양이처럼 덮치고, 내려앉은 자리에 불길을 남긴다 ───
const lavaLizard: Behavior = (m, dt) => {
  const before = m.state;
  CHAPTER2.hell_cat?.(m, dt);
  if (Math.random() < 0.1) m.scene.fx.embers(m.x, m.body.bottom - 4, EL_FIRE.color, 1, 8, 14, 400);
  if (before === 'leap' && m.state === 'recover') {
    elemFieldAt(m, EL_FIRE, m.x, m.elite ? 80 : 54, 2.5, Math.round(m.damage * 0.3));
    m.scene.fx.burst(m.x, FLOOR_Y - 6, EL_FIRE.hi, 8, 100, 300);
  }
};

// ─── 알: 가만히 있다가 9초 뒤 깨어나 새끼 둘이 된다 ───
const EGG_CRACK = 5.5;
const EGG_HATCH = 9;
export function egg(hatch: MonsterKind, el: DragonElement, crackAnim = 'egg-crack'): Behavior {
  return (m, dt) => {
    const b = m.scene;
    m.body.setVelocityX(0);
    m.aux += dt;
    if (m.aux > EGG_CRACK && m.step === 0) {
      m.step = 1;
      m.play(crackAnim);
      b.fx.burst(m.x, m.y - 6, el.hi, 6, 50, 300);
    }
    if (m.aux > EGG_HATCH - 1.2 && m.step === 1) {
      m.step = 2;
      m.play(m.look.attack);
      b.fx.text(m.x, m.body.top - 4, '부화한다!', 'quiet');
    }
    if (m.step === 2 && Math.random() < 0.3) b.fx.embers(m.x, m.y - 8, el.hi, 1, 8, 20, 300);
    if (m.aux > EGG_HATCH && m.alive) {
      b.fx.boom(m.x, m.y - 4, 18, el.boom);
      b.fx.burst(m.x, m.y, 0xc8b8a0, 14, 140, 420, 2, 400);
      sfx.play('boom', 0.4);
      for (const off of [-14, 14]) {
        const w = b.spawnMonster(hatch, m.elite, m.x + off);
        w.body.reset(m.x + off, m.y - 16);
      }
      // 깨어난 알은 처치로 치지 않는다.
      m.kill();
    }
  };
}

export const CHAPTER6: Partial<Record<MonsterKind, Behavior>> = {
  fire_whelp: whelp(EL_FIRE),
  dragon_cultist: cultist(EL_FIRE),
  lava_lizard: lavaLizard,
  dragon_egg: egg('fire_whelp', EL_FIRE),
  wyvern: dragonBoss({ def: () => DRAGON_DEFS.wyvern!, z: WYVERN_Z, wyvern: true, el: EL_FIRE, summon: ['fire_whelp', 'fire_whelp'], line: '둥지 와이번이 새끼들을 부른다!' }),
  flame_dragon: dragonBoss({ def: () => DRAGON_DEFS.flame!, z: FLAME_Z, wyvern: false, el: EL_FIRE, summon: ['fire_whelp', 'fire_whelp', 'fire_whelp'], line: '홍염룡이 격노했다! 둥지가 들끓는다!' }),
};
