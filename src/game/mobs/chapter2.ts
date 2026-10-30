import type { MonsterKind } from '../../data/monsters';
import { DEPTH } from '../fx';
import { HOVER_Y, type Behavior, type Monster } from '../monster2d';
import { FLOOR_Y } from '../world';

// 챕터 2(버려진 대성당) 몬스터의 행동

/** 플레이어 옆 side 쪽, 거리 dist, 높이 y 근처를 떠다닌다. */
export function hover(m: Monster, dist: number, y: number, follow = 0.9): void {
  const p = m.scene.player;
  const side = m.x < p.x ? -1 : 1;
  const bob = Math.sin(m.scene.time.now * 0.003 + m.maxHp) * 10;
  m.body.setVelocity((p.x + side * dist - m.x) * follow * m.slowMul, (y + bob - m.y) * 1.5);
  m.face(p.x - m.x);
}

// ─── 등불 망령: 떠다니며 따라오는 도깨비불을 쏘고, 맞으면 사라졌다 다른 곳에 나타난다 ───
const lanternWraith: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  m.attackTimer -= dt;
  m.aux -= dt;
  m.play(m.look.walk);
  hover(m, 150, FLOOR_Y - 92);
  if (m.hitCount !== m.step && m.aux <= 0) {
    // 맞으면 연기를 남기고 플레이어 반대편으로 옮겨 간다.
    m.step = m.hitCount;
    m.aux = 2;
    b.fx.smoke(m.x, m.y, 2, 0x6a7a6a, -10);
    b.fx.burst(m.x, m.y, 0x9fffb0, 8, 80, 300);
    const side = m.x < p.x ? 1 : -1;
    const nx = Math.max(40, Math.min(b.level.width - 40, p.x + side * (120 + Math.random() * 80)));
    m.body.reset(nx, FLOOR_Y - 100);
    b.fx.smoke(nx, FLOOR_Y - 100, 2, 0x6a7a6a, -10);
  }
  if (m.attackTimer <= 0 && Math.abs(p.x - m.x) < 340) {
    m.attackTimer = m.def.attackCd * (0.8 + Math.random() * 0.4);
    const ox = m.x + m.facing * 10;
    const oy = m.y + 4;
    const ang = Math.atan2(p.y - oy, p.x - ox);
    b.spawnEnemyBolt(ox, oy, Math.cos(ang) * 110, Math.sin(ang) * 110, m.damage, m, 0, { kind: 'wisp', homing: 1.5, life: 5 });
    if (m.elite) b.spawnEnemyBolt(ox, oy, Math.cos(ang + 0.5) * 110, Math.sin(ang + 0.5) * 110, m.damage, m, 0, { kind: 'wisp', homing: 1.5, life: 5 });
  }
};

// ─── 후광 망령: 뒤에 머물며 주변 몬스터에게 피해를 줄이는 보호막을 씌운다 ───
const haloWraith: Behavior = (m, dt) => {
  const b = m.scene;
  m.attackTimer -= dt;
  m.play(m.look.walk);
  hover(m, 220, FLOOR_Y - 110, 0.6);
  if (m.attackTimer > 0) return;
  m.attackTimer = m.def.attackCd;
  const r = m.elite ? 200 : 140;
  b.fx.ring(m.x, m.y + 20, r, 0xffd060, 420);
  b.fx.circle(m.x, m.y + 30, 0xffd060, 50, 500, false, DEPTH.fx);
  for (const o of b.monsters) {
    if (o === m || !o.alive || Math.hypot(o.x - m.x, o.y - m.y) > r) continue;
    o.ward = 4;
    b.fx.spark(o.x, o.y, 0xffd060);
  }
};

// ─── 불타는 해골: 떠돌다 경고 뒤 플레이어에게 돌진해 자폭한다 ───
const fireSkull: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  m.stateTime -= dt;
  m.attackTimer -= dt;
  m.play(m.look.walk);
  if (Math.random() < 0.3) b.fx.embers(m.x, m.y, 0xffa040, 1, 6, 20, 400);
  switch (m.state) {
    case 'move':
      hover(m, 60, FLOOR_Y - 115, 0.7);
      if (m.attackTimer <= 0 && Math.abs(p.x - m.x) < 220) {
        m.state = 'windup';
        m.stateTime = 0.45;
        m.body.setVelocity(0, -20);
        m.sprite.setTint(0xff6040);
      }
      break;
    case 'windup':
      // 부르르 떨며 겨눈다.
      m.sprite.x += (Math.random() - 0.5) * 3;
      if (m.stateTime <= 0) {
        m.state = 'dash';
        m.stateTime = 1.6;
        const ang = Math.atan2(p.y - m.y, p.x - m.x);
        const v = m.elite ? 330 : 280;
        m.body.setVelocity(Math.cos(ang) * v, Math.sin(ang) * v);
        m.face(p.x - m.x);
      }
      break;
    default: {
      // 돌진: 닿거나 땅에 부딪히거나 시간이 다 되면 터진다.
      b.fx.burst(m.x, m.y, 0xffc040, 2, 30, 240);
      const near = Math.abs(p.x - m.x) < 18 && Math.abs(p.y - m.y) < 22;
      if (near || m.body.bottom >= FLOOR_Y - 2 || m.body.blocked.left || m.body.blocked.right || m.stateTime <= 0) b.selfDestruct(m, m.elite ? 64 : 50);
    }
  }
};

// ─── 지옥 고양이: 거리를 재다 웅크린 뒤 크게 도약해 덮친다 ───
const hellCat: Behavior = (m, dt) => {
  const b = m.scene;
  const p = b.player;
  const { dx, dy, dist } = m.toPlayer();
  m.stateTime -= dt;
  m.attackTimer -= dt;
  switch (m.state) {
    case 'move':
      m.play(m.look.walk);
      m.sprite.anims.timeScale = 1;
      // 고양이는 발판 끝에서 멈추지 않고 뛰어내린다.
      m.body.setVelocityX(Math.sign(dx) * m.speed * m.slowMul);
      m.face(dx);
      // 플레이어가 아래에 있어도 덮친다 (위로는 높이 차가 작을 때만).
      if (m.attackTimer <= 0 && dist > 50 && dist < 220 && dy > -70 && dy < 140 && m.body.blocked.down) {
        m.state = 'windup';
        m.stateTime = 0.45;
        m.face(dx);
        m.body.setVelocityX(0);
        m.sprite.anims.timeScale = 0;
        m.sprite.setTint(0xff9aff);
      }
      break;
    case 'windup':
      m.body.setVelocityX(0);
      if (m.stateTime <= 0) {
        m.state = 'leap';
        m.stateTime = 1;
        m.hitDone = false;
        m.sprite.anims.timeScale = 1;
        m.body.setVelocity((p.x - m.x) / 0.55, -330);
        b.fx.smoke(m.x, m.body.bottom - 4, 1, 0x8a7a9a, -6);
      }
      break;
    case 'leap':
      if (!m.hitDone && Math.abs(p.x - m.x) < 26 && Math.abs(p.y - m.y) < 28) {
        m.hitDone = true;
        b.damagePlayer(m.damage, { x: m.x, monster: m, melee: true });
        b.fx.slash(m.x + m.facing * 8, m.y, m.facing, 16, 0xd080ff);
      }
      if (m.stateTime < 0.75 && m.body.blocked.down) {
        m.state = 'recover';
        m.stateTime = 0.5;
        m.attackTimer = m.def.attackCd;
        m.body.setVelocityX(0);
        if (m.elite) m.sprite.setTint(0xffb070);
        else m.sprite.clearTint();
      }
      break;
    default:
      m.body.setVelocityX(m.body.velocity.x * 0.8);
      if (m.stateTime <= 0) m.state = 'move';
  }
};

/** 천사 계열 보스의 차이 (타락천사 / 밤의 여왕) */
export interface AngelBossCfg {
  /** 깃털 탄 색 (없으면 원래 흰색) */
  featherTint?: number;
  /** 빛기둥 색 */
  beam: number;
  /** 체력 60%·30%에서 부르는 부하 */
  summon: MonsterKind;
  phase2Line: string;
  summonLine: string;
  /** true면 돌진 베기 전에 화면 끝 대신 플레이어 옆으로 순간이동한다. */
  blink?: boolean;
}

/** 천사 계열 보스: 깃털 탄막, 가로지르는 돌진, 빛기둥, 부하 소환. 체력 절반 아래에서 빨라진다. */
export function angelBoss(cfg: AngelBossCfg): Behavior {
  return (m, dt) => {
    const b = m.scene;
    const p = b.player;
    const W = b.level.width;
    const ratio = m.hp / m.maxHp;
    if (!m.phase2 && ratio < 0.5) {
      m.phase2 = true;
      b.announce(cfg.phase2Line);
      b.fx.flashScreen(cfg.beam, 0.3, 300);
    }
    if (m.summonAt.length && ratio < m.summonAt[0]) {
      m.summonAt.shift();
      b.announce(cfg.summonLine);
      for (let i = 0; i < 2; i++) b.spawnMonster(cfg.summon, false, 100 + Math.random() * (W - 200));
    }
    const fast = m.phase2 ? 0.7 : 1;
    m.stateTime -= dt;
    m.attackTimer -= dt;
    const body = m.body;

    if (m.state === 'move' || m.state === 'recover') {
      m.play(m.look.walk);
      const tx = p.x + (m.x < p.x ? -150 : 150);
      body.setVelocity((tx - m.x) * 0.8, (HOVER_Y - 20 - m.y) * 2);
      m.face(p.x - m.x);
      if (m.state === 'recover') {
        if (m.stateTime <= 0) m.state = 'move';
        return;
      }
      if (m.attackTimer > 0) return;
      const options = ['feathers', 'sweep', 'beams', 'feathers', 'beams'] as const;
      m.pattern = options[Math.floor(Math.random() * options.length)];
      m.state = 'pattern';
      m.step = 0;
      m.stateTime = 0.5 * fast;
      m.hitDone = false;
      if (m.pattern === 'sweep') {
        m.targetY = Math.min(FLOOR_Y - 40, p.y - 10);
        if (cfg.blink) {
          // 순간이동: 연기를 남기고 플레이어 옆에 나타난다.
          const side = Math.random() < 0.5 ? -1 : 1;
          m.targetX = Math.max(60, Math.min(W - 60, p.x + side * 170));
          b.fx.smoke(m.x, m.y, 3, 0x4a2a3a, -10);
          m.body.reset(m.targetX, m.targetY);
          b.fx.smoke(m.targetX, m.targetY, 3, 0x4a2a3a, -10);
          b.fx.burst(m.targetX, m.targetY, cfg.beam, 12, 120, 360);
          m.aux = m.targetX;
        } else {
          // 플레이어에게서 먼 쪽 끝으로 날아간다.
          m.targetX = p.x < W / 2 ? W - 70 : 70;
        }
      }
      return;
    }

    switch (m.pattern) {
      case 'feathers': {
        body.setVelocity(0, (HOVER_Y - 20 - m.y) * 2);
        m.play(m.look.attack);
        const volleys = m.phase2 ? 3 : 2;
        if (m.stateTime <= 0 && m.step < volleys) {
          m.step++;
          m.stateTime = 0.45 * fast;
          const n = m.phase2 ? 9 : 7;
          const base = Math.atan2(p.y - m.y, p.x - m.x);
          for (let i = 0; i < n; i++) {
            const a = base + (i / (n - 1) - 0.5) * 0.9;
            b.spawnEnemyBolt(m.x, m.y, Math.cos(a) * 210, Math.sin(a) * 210, m.damage * 0.5, m, 0, { kind: 'feather', tint: cfg.featherTint });
          }
          b.fx.burst(m.x, m.y, cfg.featherTint ?? 0xfff4e0, 12, 140, 360);
        }
        if (m.step >= volleys && m.stateTime <= 0) m.endPattern();
        break;
      }
      case 'sweep': {
        // 순간이동형은 플레이어를 가운데 두고 짧게(340px) 가로지른다.
        const reach = cfg.blink ? 340 : W;
        if (m.step === 0) {
          body.setVelocity((m.targetX - m.x) * 3, (m.targetY - m.y) * 3);
          if (Math.abs(m.targetX - m.x) < 16 && Math.abs(m.targetY - m.y) < 16) {
            m.step = 1;
            m.stateTime = (cfg.blink ? 0.45 : 0.7) * fast;
            body.setVelocity(0, 0);
            m.face(cfg.blink ? p.x - m.x : W / 2 - m.x);
            const x0 = cfg.blink ? (m.facing === 1 ? m.x : m.x - reach) : 0;
            b.addTelegraph(x0, m.targetY - 26, cfg.blink ? reach : W, 52, m.stateTime, m, null);
          } else if (m.stateTime < -2.5) m.endPattern();
        } else if (m.step === 1) {
          body.setVelocity(0, 0);
          if (m.stateTime <= 0) {
            m.step = 2;
            m.aux = m.x;
            m.play(m.look.attack);
            body.setVelocity(m.facing * 560, 0);
          }
        } else {
          b.fx.streak(m.x, m.y, m.facing === 1 ? 0 : Math.PI, 60, cfg.beam, 120, 3);
          if (!m.hitDone && Math.abs(p.x - m.x) < 34 && Math.abs(p.y - m.y) < 40) {
            m.hitDone = true;
            b.damagePlayer(m.damage, { x: m.x, monster: m, melee: true });
            p.knockback(m.x, 240);
          }
          const passed = Math.abs(m.x - m.aux) > reach;
          if (passed || (m.facing === 1 && m.x > W - 60) || (m.facing === -1 && m.x < 60)) m.endPattern();
        }
        break;
      }
      case 'beams': {
        body.setVelocity(0, (HOVER_Y - 20 - m.y) * 2);
        if (m.step === 0) {
          m.step = 1;
          m.play(m.look.attack);
          const offs = m.phase2 ? [-140, -70, 0, 70, 140] : [-80, 0, 80];
          for (const o of offs) b.lightBeam(p.x + o, m.damage * 0.9, m, 0.9 * fast + Math.abs(o) * 0.0015, 36, cfg.beam);
          b.fx.circle(m.x, m.y + 40, cfg.beam, 80, 900, false, DEPTH.fx);
          m.stateTime = 1.4 * fast;
        } else if (m.stateTime <= 0) m.endPattern();
        break;
      }
      default:
        m.endPattern();
    }
  };
}

// ─── 타락천사 (보스): 깃털 탄막, 가로지르는 돌진, 빛기둥, 등불 망령 소환 ───
const fallenAngel = angelBoss({
  beam: 0xfff0c0,
  summon: 'lantern_wraith',
  phase2Line: '타락천사가 검은 날개를 펼친다!',
  summonLine: '타락천사가 망령을 부른다!',
});

export const CHAPTER2: Partial<Record<MonsterKind, Behavior>> = {
  lantern_wraith: lanternWraith,
  halo_wraith: haloWraith,
  fire_skull: fireSkull,
  hell_cat: hellCat,
  fallen_angel: fallenAngel,
};
