import { keyLabel, type Action } from '../core/input';
import { sfx } from '../core/audio';
import type { PhaseDef } from '../data/phases';
import { chunkSkills, SKILL_BY_ID, SKILL_TIER_NAME, SKILLS, skillsFor, type SkillDef } from '../data/skills';
import { CLASS_NAME, WEAPONS, type WeaponDef, type WeaponType } from '../data/weapons';
import '../ui/tutorial.css';
import type { BattleScene } from './battleScene';
import { ctx } from './context';
import type { Monster } from './monster2d';
import { COMBO_MAX, equipWeapons } from './player2d';
import { ensureScarecrow } from './scarecrow';

/** 튜토리얼 전용 맵. 웨이브와 보상은 없고, 단계 진행은 Tutorial이 맡는다. */
export const TUTORIAL_PHASE: PhaseDef = {
  id: 'tutorial',
  name: '기초 훈련',
  type: 'normal',
  chapter: 0,
  desc: '',
  hpMul: 1,
  width: 1100,
  platforms: [],
  theme: 'day',
  waves: [],
  clearReward: { gold: 0, exp: 0, materials: {}, sweepTickets: 0 },
};

const MOVE_GOAL = 160;
const STEP_PAUSE = 0.7;
const FIGHT_COUNT = 3;
/** 직업 체험장 */
const TRIAL_CLASSES: WeaponType[] = ['sword', 'dao', 'bow', 'gun', 'staff'];
const SCARECROW_XS = [360, 520, 680];

/** 그 직업의 가장 기본 무기 */
function trialWeapon(type: WeaponType): WeaponDef {
  return Object.values(WEAPONS).find((w) => w.type === type && w.grade === 'common')!;
}


/** 글 조각: 문자열은 그대로, { key }는 현재 키 설정의 키캡으로 그린다. */
type Part = string | { key: Action };

interface Step {
  title: string;
  text: Part[];
  /** 지금 건너뛸 단계인가 (현재 무기로 할 수 없는 동작) */
  skip?: (t: Tutorial) => boolean;
  start?: (t: Tutorial) => void;
  /** 완료했으면 true */
  done: (t: Tutorial) => boolean;
  /** 진행 표시 */
  progress?: (t: Tutorial) => string;
  end?: (t: Tutorial) => void;
}

const STEPS: Step[] = [
  {
    title: '이동',
    text: [{ key: 'left' }, ' ', { key: 'right' }, ' 키로 좌우로 움직이세요.'],
    done: (t) => t.moved >= MOVE_GOAL,
  },
  {
    title: '점프',
    text: [{ key: 'jump' }, ' 키로 뛰고, 공중에서 한 번 더 누르면 더블 점프입니다. 좌우 키를 누른 채면 그쪽으로 강하게, ', { key: 'up' }, ' 키를 누른 채면 위로 뜁니다.'],
    done: (t) => !t.b.player.grounded && t.b.player.airJumps === 0,
  },
  {
    title: '기본 공격',
    text: ['허수아비 앞에서 ', { key: 'attack' }, ' 키를 연달아 눌러 5연계까지 이어 가세요.'],
    start: (t) => t.spawnTarget(),
    done: (t) => t.targetHit() && t.b.player.combo >= COMBO_MAX,
    progress: (t) => `${t.b.player.combo} / ${COMBO_MAX}`,
    end: (t) => t.removeTarget(),
  },
  {
    title: '구르기',
    text: [{ key: 'dodge' }, ' 키로 구르세요. 구르는 동안은 공격을 맞지 않습니다.'],
    done: (t) => t.b.player.dodgeTime > 0,
  },
  {
    title: '가드',
    text: [{ key: 'guard' }, ' 키를 누르고 있으면 앞에서 오는 공격을 막습니다.'],
    skip: (t) => !t.b.player.isMelee,
    done: (t) => t.b.player.guarding,
  },
  {
    title: '스킬',
    text: [{ key: 'slot1' }, ' 키로 첫 번째 스킬을 쓰세요. 스킬은 마나와 재사용 시간이 필요합니다.'],
    skip: (t) => !t.b.player.weapon.slots[0],
    done: (t) => {
      const skill = t.b.player.weapon.slots[0];
      return !!skill && (t.b.player.cooldowns.get(skill.id) ?? 0) > 0;
    },
  },
  {
    title: '무기 교체',
    text: [{ key: 'swap' }, ' 키로 장착한 다른 무기로 바꾸세요. 무기마다 공격과 스킬이 다릅니다.'],
    start: (t) => (t.startWeapon = t.b.player.active),
    done: (t) => t.b.player.active !== t.startWeapon,
  },
  {
    title: '실전',
    text: ['배운 동작으로 해골 병사를 모두 처치하세요.'],
    start: (t) => t.spawnFight(),
    done: (t) => t.fightStarted && !t.b.monsters.some((m) => m.alive),
    progress: (t) => `남은 적 ${t.b.monsters.filter((m) => m.alive).length}`,
  },
];

/** 전투 씬 위에서 단계별로 조작을 가르친다. */
export class Tutorial {
  moved = 0;
  startWeapon = 0;
  fightStarted = false;

  private index = -1;
  private pause = 0;
  private lastX: number;
  private target: Monster | null = null;
  /** 직업 체험장에 들어왔는가 */
  inTrial = false;
  private readonly triedSkills = new Set<string>();
  /** 안내를 마지막으로 그린 직업과 스킬 장 */
  private trialShown = '';

  private readonly panel: HTMLDivElement;
  private readonly dots: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly text: HTMLDivElement;
  private readonly progress: HTMLDivElement;
  private readonly steps: Step[];

  constructor(readonly b: BattleScene, parent: HTMLElement, trialOnly = false) {
    this.steps = STEPS;
    this.lastX = b.player.x;
    this.panel = document.createElement('div');
    this.panel.className = 'tut-panel';
    this.panel.innerHTML = `
      <div class="tut-dots"></div>
      <div class="tut-title"></div>
      <div class="tut-text"></div>
      <div class="tut-progress"></div>
      <div class="tut-desc"></div>
      <div class="tut-skip"></div>`;
    parent.appendChild(this.panel);
    this.dots = this.panel.querySelector('.tut-dots')!;
    this.title = this.panel.querySelector('.tut-title')!;
    this.text = this.panel.querySelector('.tut-text')!;
    this.progress = this.panel.querySelector('.tut-progress')!;
    this.fillParts(this.panel.querySelector('.tut-skip')!, [{ key: 'menu' }, ' 건너뛰기']);
    for (let i = 0; i < this.steps.length; i++) this.dots.appendChild(document.createElement('span'));
    if (trialOnly) this.startTrial();
    else this.next();
  }

  /** 일시정지 창의 안내와 나가기 버튼 글 */
  pauseLabels(): { text: string; giveUp: string } {
    return this.inTrial
      ? { text: `체험장을 나가 마을로 갑니다. 첫 전투는 게시판 앞에서 ${keyLabel(this.b.save.keymap.interact)} 키로 고릅니다. 체험장은 설정에서 다시 올 수 있습니다.`, giveUp: '체험장 나가기' }
      : { text: '튜토리얼을 건너뛰고 마을로 갑니다. 설정에서 언제든 다시 할 수 있습니다.', giveUp: '튜토리얼 건너뛰기' };
  }

  update(dt: number): void {
    if (this.inTrial) {
      this.updateTrial();
      return;
    }
    const p = this.b.player;
    this.moved += Math.abs(p.x - this.lastX);
    this.lastX = p.x;
    // 싸움 전까지는 마나 걱정 없이 연습한다.
    if (!this.fightStarted) p.mp = p.derived.maxMp;

    if (this.pause > 0) {
      this.pause -= dt;
      if (this.pause <= 0) this.next();
      return;
    }
    const step = this.steps[this.index];
    this.progress.textContent = step.progress?.(this) ?? '';
    if (step.done(this)) {
      step.end?.(this);
      sfx.play('parry');
      this.panel.classList.add('done');
      this.dots.children[this.index]?.classList.add('on');
      this.progress.textContent = '';
      this.pause = STEP_PAUSE;
    }
  }

  private next(): void {
    this.index++;
    while (this.steps[this.index]?.skip?.(this)) {
      this.dots.children[this.index]?.classList.add('on');
      this.index++;
    }
    const step = this.steps[this.index];
    if (!step) {
      this.startTrial();
      return;
    }
    this.panel.classList.remove('done');
    this.title.textContent = step.title;
    this.fillParts(this.text, step.text);
    this.progress.textContent = '';
    step.start?.(this);
  }

  /** 훈련을 마치면 들어오는 곳: 모든 직업과 스킬을 허수아비에게 자유롭게 써 본다. 세이브는 건드리지 않는다. */
  private startTrial(): void {
    this.inTrial = true;
    // 여기까지 왔으면 튜토리얼은 끝난 것이다 (이대로 창을 닫아도 다시 하지 않는다).
    ctx.onTutorialEnd();
    const b = this.b;
    const p = b.player;
    b.setBeam(false);
    p.action = null;
    p.charge = -1;
    p.resetCombo();
    p.weapons = equipWeapons(TRIAL_CLASSES.map((type) => ({ def: trialWeapon(type), enhance: 0, pages: chunkSkills(skillsFor(type)) })));
    p.active = 0;
    p.cooldowns.clear();
    // 낮은 레벨의 최대 마나로는 궁극기(마나 120)를 못 쓴다.
    p.derived.maxMp = Math.max(p.derived.maxMp, ...SKILLS.map((s) => s.mana));

    ensureScarecrow(b);
    for (const x of SCARECROW_XS) b.spawnMonster('scarecrow', false, x);
    sfx.play('wave');

    this.panel.classList.remove('done');
    this.panel.classList.add('complete', 'trial');
    this.dots.replaceChildren();
    this.panel.querySelector('.tut-desc')!.textContent = '';
    this.fillParts(this.panel.querySelector('.tut-skip')!, [{ key: 'menu' }, ' 나가기']);
  }

  private updateTrial(): void {
    const b = this.b;
    const p = b.player;
    p.hp = p.derived.maxHp;
    p.mp = p.derived.maxMp;

    const i = p.active;
    const w = p.weapon;
    const shown = `${i}:${w.page}`;
    if (shown !== this.trialShown) {
      this.trialShown = shown;
      this.title.textContent = `${CLASS_NAME[TRIAL_CLASSES[i]]} 체험 (${i + 1} / ${TRIAL_CLASSES.length})`;
      this.fillParts(this.text, [
        { key: 'swap' }, ' 다음 직업',
        ...(w.pages.length > 1 ? (['  ·  ', { key: 'skillPage' }, ` 다음 스킬 장 (${w.page + 1} / ${w.pages.length})`] as Part[]) : []),
        '  ·  재사용 시간과 마나 소모 없음',
      ]);
    }

    // 방금 쓴 스킬을 기록하고 설명을 보여 준 뒤, 바로 다시 쓸 수 있게 한다.
    for (const [id, cd] of p.cooldowns) {
      if (cd <= 0) continue;
      this.triedSkills.add(id);
      this.showSkill(SKILL_BY_ID[id]);
      p.cooldowns.set(id, 0);
    }
    this.progress.textContent = `써 본 스킬 ${this.triedSkills.size} / ${SKILLS.length}`;
  }

  private showSkill(skill: SkillDef): void {
    const tier = skill.tier ? `[${SKILL_TIER_NAME[skill.tier]}] ` : '';
    this.panel.querySelector('.tut-desc')!.textContent = `${tier}${skill.name} — ${skill.desc}`;
  }

  private fillParts(el: Element, parts: Part[]): void {
    el.replaceChildren();
    const keymap = this.b.save.keymap;
    for (const part of parts) {
      if (typeof part === 'string') {
        el.append(part);
      } else {
        const k = document.createElement('kbd');
        k.textContent = keyLabel(keymap[part.key]);
        el.append(k);
      }
    }
  }

  spawnTarget(): void {
    const p = this.b.player;
    const w = this.b.level.width;
    // 앞쪽에 자리가 없으면 뒤쪽에 세운다.
    const x = p.x + 130 < w - 60 ? p.x + 130 : p.x - 130;
    ensureScarecrow(this.b);
    this.target = this.b.spawnMonster('scarecrow', false, x);
  }

  targetHit(): boolean {
    return !!this.target && this.target.hitCount > 0;
  }

  removeTarget(): void {
    this.target?.kill();
    this.target = null;
  }

  spawnFight(): void {
    const p = this.b.player;
    const w = this.b.level.width;
    for (let i = 0; i < FIGHT_COUNT; i++) {
      const side = p.x + 200 < w - 60 ? 1 : -1;
      this.b.spawnMonster('zombie', false, p.x + side * (170 + i * 50));
    }
    sfx.play('wave');
    this.fightStarted = true;
  }

  destroy(): void {
    this.panel.remove();
  }
}
