import Phaser from 'phaser';
import './style.css';
import './ui/theme.css';
import './ui/panels.css';
import { Input } from './core/input';
import { sfx } from './core/audio';
import { loadSave, newSave, writeSave, type SaveData } from './core/save';
import { PHASE_BY_ID } from './data/phases';
import type { MonsterKind } from './data/monsters';
import type { WeaponType } from './data/weapons';
import { classAnimKey } from './game/classSprites';
import { MATERIALS } from './data/items';
import { BattleScene } from './game/battleScene';
import { BootScene } from './game/bootScene';
import { ctx, type Area, type BattleOutcome, type StationId } from './game/context';
import { legionPhase, type LegionRun } from './data/legion';
import { koNum } from './ui/format';
import { worldBossPhase } from './data/worldBoss';
import { useWorldBossTry } from './ui/worldBossPanel';
import { addExp } from './game/stats';
import { TownScene } from './game/townScene';
import { fitWidth, VIEW_H } from './game/world';
import type { Hud } from './ui/hud';
import { TownHud } from './ui/townHud';
import { VillageUI, type Tab } from './ui/village';
import { DevPanel } from './ui/devPanel';

const uiRoot = document.getElementById('ui')!;

let save: SaveData = loadSave();
const input = new Input(save.keymap);
sfx.setVolume(save.sfxVolume);
// 브라우저는 사용자 입력이 있어야 소리를 낼 수 있다.
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

const STATION_TABS: Record<StationId, Tab[]> = {
  board: ['phase'],
  smith: ['enhance', 'exchange'],
  shop: ['shop'],
  trainer: ['skill'],
  chest: ['equip'],
  portal: [],
  legion: ['legion'],
  armory: ['armory'],
  shards: ['shards'],
  golem: ['worldboss'],
};

function replaceSave(next: SaveData): void {
  save = next;
  input.setKeymap(save.keymap);
  sfx.setVolume(save.sfxVolume);
  writeSave(save);
}

// ───────── 로딩 화면 ─────────
const loading = document.createElement('div');
loading.className = 'loading-screen';
loading.innerHTML =
  '<div class="loading-title">파도막이</div><div class="loading-bar"><div class="loading-fill"></div></div><div class="loading-text">불러오는 중...</div>';
uiRoot.appendChild(loading);
const loadingFill = loading.querySelector<HTMLDivElement>('.loading-fill')!;

// ───────── UI ─────────
const townHud = new TownHud(uiRoot);
townHud.hide();

const village = new VillageUI(uiRoot, () => save, {
  onStartPhase: startPhase,
  onStartLegion: startLegion,
  onStartWorldBoss: startWorldBoss,
  onSaveChanged: () => {
    writeSave(save);
    input.setKeymap(save.keymap);
    sfx.setVolume(save.sfxVolume);
  },
  onImport: (s) => replaceSave(s),
  onReset: () => replaceSave(newSave()),
  portrait: heroPortrait,
  art: (key: string) => {
    if (!game.textures.exists(key)) return null;
    const src = game.textures.get(key).getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    return c;
  },
  onClose: () => {
    input.enabled = true;
    // 창을 닫은 키(↑·Esc)가 바로 다시 창을 열지 않게 이번 입력을 비운다.
    input.endFrame();
    writeSave(save);
  },
});

const appEl = document.getElementById('app')!;
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: fitWidth(appEl),
  height: VIEW_H,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0d1016',
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 1000 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [
    new BootScene(
      (r) => (loadingFill.style.width = `${Math.round(r * 100)}%`),
      () => loading.remove(),
    ),
    TownScene,
    BattleScene,
  ],
});

// ───────── 개발자 모드 (` 키) ─────────
const devPanel = new DevPanel(uiRoot, {
  getSave: () => save,
  saveChanged: () => {
    writeSave(save);
    if (village.isOpen) village.refresh();
  },
  battle: () => (game.scene.isActive('battle') ? (game.scene.getScene('battle') as BattleScene) : null),
  onClose: () => {
    input.enabled = !village.isOpen;
    input.endFrame();
  },
  travel: (area) => {
    if (game.scene.isActive('town')) travel(area);
  },
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Backquote' || e.repeat) return;
  e.preventDefault();
  devPanel.toggle();
  if (devPanel.isOpen) input.enabled = false;
});

// 화면 비율이 바뀌면 가로 해상도를 다시 맞춘다 (세로 360 고정).
// window resize는 F11 전환 중 레이아웃이 끝나기 전에 와서 중간 크기를 읽을 수 있으므로,
// 레이아웃이 끝난 뒤 알려주는 ResizeObserver로 #app 크기를 직접 본다.
new ResizeObserver(() => {
  const w = fitWidth(appEl);
  // FIT 계산이 이전 부모 크기를 쓰지 않게 먼저 갱신한다.
  game.scale.getParentBounds();
  if (w !== game.scale.width) game.scale.setGameSize(w, VIEW_H);
  else game.scale.refresh();
}).observe(appEl);

function onBattleEnd(o: BattleOutcome, hud: Hud, backToTown: () => void): void {
  let levelsGained = 0;
  if (o.cleared) {
    save.gold += o.gold;
    levelsGained = addExp(save, o.exp);
    for (const [id, n] of Object.entries(o.materials)) save.materials[id] = (save.materials[id] ?? 0) + n;
    save.sweepTickets += o.sweepTickets;
    if (!o.legion && !o.worldBoss && !save.cleared.includes(o.phase.id)) save.cleared.push(o.phase.id);
    if (o.legion) save.legion.clears[o.legion.id] = (save.legion.clears[o.legion.id] ?? 0) + 1;
  }
  // 월드 보스 최고 기록 (소탕은 이 기록으로 보상을 준다)
  let best = false;
  if (o.worldBoss) {
    const wb = save.worldBoss;
    if (o.worldBoss.bars > wb.bestBars || (o.worldBoss.bars === wb.bestBars && o.worldBoss.damage > wb.bestDamage)) {
      best = true;
      wb.bestBars = o.worldBoss.bars;
      wb.bestDamage = o.worldBoss.damage;
    }
  }
  // 실패해도 전투 중 사용한 포션은 반영해야 하므로 항상 저장한다.
  writeSave(save);
  let done = false;
  const go = (): void => {
    if (done) return;
    done = true;
    window.removeEventListener('keydown', onKey);
    backToTown();
  };
  // 키보드만으로도 결과 창을 넘길 수 있게 Enter·Space를 받는다.
  const onKey = (e: KeyboardEvent): void => {
    if (e.code === 'Enter' || e.code === 'Space') go();
  };
  window.addEventListener('keydown', onKey);
  hud.showResult(
    {
      cleared: o.cleared,
      phaseName: o.legion || o.worldBoss ? o.phase.name : `${o.phase.id} ${o.phase.name}`,
      legion: !!o.legion,
      worldBoss: o.worldBoss ? { bars: o.worldBoss.bars, damage: koNum(o.worldBoss.damage), best } : undefined,
      gold: o.gold,
      exp: o.exp,
      materials: [
        ...Object.entries(o.materials).map(([id, count]) => ({ name: MATERIALS[id]?.name ?? id, count })),
        // 월드 보스는 10줄마다 소탕권도 준다.
        ...(o.worldBoss && o.sweepTickets > 0 ? [{ name: '소탕권', count: o.sweepTickets }] : []),
      ],
      kills: o.kills,
      levelsGained,
    },
    go,
  );
}

Object.assign(ctx, {
  input,
  uiRoot,
  townHud,
  getSave: () => save,
  writeSave: () => writeSave(save),
  windowOpen: () => village.isOpen,
  openStation: (id: StationId, name: string) => {
    // 포탈: 마을 ↔ 전투 기지
    if (id === 'portal') {
      const town = game.scene.getScene('town') as TownScene;
      travel(town.area === 'base' ? 'town' : 'base');
      return;
    }
    input.enabled = false;
    village.open(STATION_TABS[id], name);
  },
  openPanel: (tab: 'equip' | 'skill') => {
    input.enabled = false;
    village.open([tab], tab === 'equip' ? '장비' : '스킬');
  },
  openMenu: () => {
    input.enabled = false;
    village.open(['settings'], '메뉴');
  },
  onBattleEnd,
});

/** 마을과 전투 기지를 오간다. */
function travel(area: Area): void {
  const town = game.scene.getScene('town') as TownScene;
  town.cameras.main.fadeOut(250, 20, 8, 40);
  town.time.delayedCall(260, () => {
    input.endFrame();
    town.scene.restart({ area });
  });
}

function startLegion(run: LegionRun): void {
  village.hide();
  input.enabled = true;
  input.endFrame();
  game.scene.stop('town');
  game.scene.start('battle', { phase: legionPhase(run), legion: run });
}

/** 월드 보스 도전: 하루 횟수를 하나 쓰고 들어간다. */
function startWorldBoss(): void {
  if (!useWorldBossTry(save)) return;
  writeSave(save);
  village.hide();
  input.enabled = true;
  input.endFrame();
  game.scene.stop('town');
  game.scene.start('battle', { phase: worldBossPhase(), worldBoss: true });
}

function startPhase(id: string): void {
  const phase = PHASE_BY_ID[id];
  if (!phase) return;
  village.hide();
  input.enabled = true;
  input.endFrame();
  game.scene.stop('town');
  game.scene.start('battle', { phase });
}

// 개발 서버 전용: 자동화 테스트에서 화면 갱신이 멈춰도 게임을 원하는 만큼 진행시킨다.
if (import.meta.env.DEV) {
  const battle = (): BattleScene | null => (game.scene.isActive('battle') ? (game.scene.getScene('battle') as BattleScene) : null);
  (window as unknown as Record<string, unknown>).__bw = {
    get game(): Phaser.Game {
      return game;
    },
    get battle(): BattleScene | null {
      return battle();
    },
    start(phaseId: string): string {
      startPhase(phaseId);
      return 'started';
    },
    legion(run: LegionRun): string {
      startLegion(run);
      return 'started';
    },
    step(frames = 60): string {
      const b = battle();
      if (!b) return 'no battle';
      for (let i = 0; i < frames; i++) {
        b.physics.world.step(1 / 60);
        b.update(0, 1000 / 60);
      }
      return b.debugSummary();
    },
    spawn(kind: MonsterKind, elite = false): string {
      battle()?.spawnMonster(kind, elite);
      return battle()?.debugSummary() ?? 'no battle';
    },
  };
}

/** 장비창의 캐릭터 그림: 직업별 대기 자세 첫 칸을 캔버스로 잘라 온다. */
function heroPortrait(type: WeaponType): HTMLCanvasElement | null {
  const key = classAnimKey(type, 'hero-idle');
  if (!game.textures.exists(key)) return null;
  const frame = game.textures.getFrame(key, 0);
  if (!frame) return null;
  const c = document.createElement('canvas');
  c.width = frame.cutWidth;
  c.height = frame.cutHeight;
  c.getContext('2d')!.drawImage(frame.source.image as CanvasImageSource, frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight, 0, 0, frame.cutWidth, frame.cutHeight);
  return c;
}
