import Phaser from 'phaser';
import type { MonsterKind } from '../../data/monsters';
import { DRAGON_DEFS, WYVERN_Z } from '../dragon/chapter6Art';
import { dragonBoss, EL_FROST, EL_SHADOW, EL_STORM } from '../dragon/dragonBoss';
import { BONE_Z, SHADOW_Z, STORM_Z } from '../dragon/lateArt';
import type { Behavior, Monster } from '../monster2d';
import { FLOOR_Y } from '../world';
import { cultist, egg, whelp } from './chapter6';
import { CHAPTER3 } from './chapter3';
import { CHAPTER5 } from './chapter5';

// 챕터 7~10 몬스터의 행동. 용 계열은 속성만 바꾼 챕터 6의 행동을 쓴다.

// ─── 뇌전 늑대: 은빛 늑대처럼 무리 지어 달리고, 빠르게 달릴 때 전기가 튄다 ───
const thunderWolf: Behavior = (m, dt) => {
  CHAPTER3.silver_wolf?.(m, dt);
  if (Math.abs(m.body.velocity.x) > 120 && Math.random() < 0.2) m.scene.fx.spark(m.x - m.facing * 10, m.y, 0xffe04a, 0.6, Math.random() * Math.PI);
};

// ─── 마계 주술사: 거리를 두고, 플레이어 머리 위로 운석을 떨어뜨린다 ───
const hellCaster: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const { dx, dist } = m.toPlayer();
  m.stateTime -= dt;
  m.attackTimer -= dt;
  if (m.state === 'move') {
    m.play(m.look.walk);
    if (dist > 240) m.walk(Math.sign(dx));
    else if (dist < 140) m.walk(-Math.sign(dx), 0.8);
    else m.walk(0);
    m.face(dx);
    if (m.attackTimer <= 0 && dist < 400) {
      m.state = 'windup';
      m.stateTime = 1.2;
      m.body.setVelocityX(0);
      m.play(m.look.attack);
      b.fx.circle(m.x, m.y - 30, 0xff4a2a, 30, 600, false);
      const xs = m.elite ? [p.x - 80, p.x, p.x + 80] : [p.x];
      xs.forEach((x, i) => b.enemyMeteor(Phaser.Math.Clamp(x, 40, b.level.width - 40), m.damage, m, 0.15 + i * 0.2));
    }
    return;
  }
  m.body.setVelocityX(0);
  if (m.stateTime <= 0) {
    m.state = 'move';
    m.attackTimer = m.def.attackCd;
  }
};

// ─── 마왕: 처음에는 거대한 악마로 싸우다가, 체력 절반에서 용의 모습을 드러낸다 ───
const KING_W = 136;
const KING_H = 92;
const kingDragon = dragonBoss({
  def: () => DRAGON_DEFS.shadow!,
  z: SHADOW_Z,
  wyvern: false,
  el: EL_SHADOW,
  summon: ['shadow_whelp', 'royal_guard', 'shadow_whelp'],
  line: '마왕이 마지막 힘을 끌어낸다!',
  enrageAt: 0.2,
});

function transform(m: Monster): void {
  const b = m.scene;
  m.transformed = true;
  m.phase2 = false;
  m.phase3 = false;
  m.state = 'move';
  m.stateTime = 0;
  m.endPattern();
  b.announce('마왕이 진짜 모습을 드러낸다!', 2.4);
  b.fx.flashScreen(0xb050ff, 0.55, 600);
  b.fx.shake(2.6, 800);
  b.fx.boom(m.x, m.y, 70, 'dark');
  b.fx.ring(m.x, FLOOR_Y, 260, 0xb050ff, 700);
  // 악마의 몸은 흩어지고, 용의 몸으로 땅에 내려선다.
  const ghost = b.add.sprite(m.sprite.x, m.sprite.y, m.sprite.texture.key, m.sprite.frame.name).setOrigin(0.5, 1).setScale(m.sprite.scaleX).setFlipX(m.sprite.flipX).setDepth(m.sprite.depth);
  b.tweens.add({ targets: ghost, alpha: 0, scaleY: ghost.scaleY * 1.3, duration: 700, onComplete: () => ghost.destroy() });
  m.zone.setSize(KING_W, KING_H);
  m.body.setSize(KING_W, KING_H, true);
  m.body.setAllowGravity(true);
  m.body.setVelocity(0, 0);
  m.attackTimer = 2.2;
}

const demonKing: Behavior = (m, dt) => {
  if (!m.transformed) {
    if (m.hp / m.maxHp > 0.5) {
      m.updateDemon(dt);
      return;
    }
    transform(m);
  }
  kingDragon(m, dt);
};

export const LATE_CHAPTERS: Partial<Record<MonsterKind, Behavior>> = {
  // 챕터 7: 용의 무덤
  bone_whelp: whelp(EL_FROST),
  grave_priest: cultist(EL_FROST),
  soul_egg: egg('bone_whelp', EL_FROST, 'segg-crack'),
  bone_wyvern: dragonBoss({ def: () => DRAGON_DEFS.boneWyvern!, z: WYVERN_Z, wyvern: true, el: EL_FROST, summon: ['bone_whelp', 'bone_whelp'], line: '해골 와이번이 새끼들을 깨운다!' }),
  bone_dragon: dragonBoss({ def: () => DRAGON_DEFS.bone!, z: BONE_Z, wyvern: false, el: EL_FROST, summon: ['bone_whelp', 'frost_skeleton', 'bone_whelp'], line: '해골 용왕이 무덤을 깨운다!' }),
  // 챕터 8: 폭풍의 첨탑
  storm_whelp: whelp(EL_STORM),
  storm_caller: cultist(EL_STORM),
  storm_harpy: CHAPTER5.void_angel,
  thunder_wolf: thunderWolf,
  storm_wyvern: dragonBoss({ def: () => DRAGON_DEFS.stormWyvern!, z: WYVERN_Z, wyvern: true, el: EL_STORM, summon: ['storm_whelp', 'storm_whelp'], line: '폭풍 와이번이 벼락을 부른다!' }),
  storm_dragon: dragonBoss({ def: () => DRAGON_DEFS.storm!, z: STORM_Z, wyvern: false, el: EL_STORM, summon: ['storm_whelp', 'thunder_wolf', 'storm_whelp'], line: '뇌룡이 폭풍을 일으킨다!' }),
  // 챕터 9: 불타는 마계
  hell_caster: hellCaster,
  // 챕터 10: 마왕성
  shadow_whelp: whelp(EL_SHADOW),
  shadow_priest: cultist(EL_SHADOW),
  shadow_wyvern: dragonBoss({ def: () => DRAGON_DEFS.shadowWyvern!, z: WYVERN_Z, wyvern: true, el: EL_SHADOW, summon: ['shadow_whelp', 'shadow_whelp'], line: '그림자 와이번이 어둠을 부른다!' }),
  demon_king: demonKing,
};
