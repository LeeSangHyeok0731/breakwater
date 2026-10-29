import Phaser from 'phaser';
import './style.css';
import './ui/theme.css';
import { Input } from './core/input';
import { sfx } from './core/audio';
import { loadSave, newSave, writeSave, type SaveData } from './core/save';
import { PHASE_BY_ID } from './data/phases';
import type { MonsterKind } from './data/monsters';
import { MATERIALS } from './data/items';
import { BattleScene } from './game/battleScene';
import { BootScene } from './game/bootScene';
import { ctx, type BattleOutcome, type StationId } from './game/context';
import { addExp } from './game/stats';
import { TownScene } from './game/townScene';
import { fitWidth, VIEW_H } from './game/world';
import type { Hud } from './ui/hud';
import { TownHud } from './ui/townHud';
import { VillageUI, type Tab } from './ui/village';

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
  trainer: ['char', 'skill'],
  chest: ['equip'],
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
  onSaveChanged: () => {
    writeSave(save);
    input.setKeymap(save.keymap);
    sfx.setVolume(save.sfxVolume);
  },
  onImport: (s) => replaceSave(s),
  onReset: () => replaceSave(newSave()),
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

// 창 비율이 바뀌면 가로 해상도를 다시 맞춘다 (세로 360 고정).
window.addEventListener('resize', () => game.scale.setGameSize(fitWidth(appEl), VIEW_H));

function onBattleEnd(o: BattleOutcome, hud: Hud, backToTown: () => void): void {
  let levelsGained = 0;
  if (o.cleared) {
    save.gold += o.gold;
    levelsGained = addExp(save, o.exp);
    for (const [id, n] of Object.entries(o.materials)) save.materials[id] = (save.materials[id] ?? 0) + n;
    save.sweepTickets += o.sweepTickets;
    if (!save.cleared.includes(o.phase.id)) save.cleared.push(o.phase.id);
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
      phaseName: `${o.phase.id} ${o.phase.name}`,
      gold: o.gold,
      exp: o.exp,
      materials: Object.entries(o.materials).map(([id, count]) => ({ name: MATERIALS[id]?.name ?? id, count })),
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
    input.enabled = false;
    village.open(STATION_TABS[id], name);
  },
  openMenu: () => {
    input.enabled = false;
    village.open(['settings'], '메뉴');
  },
  onBattleEnd,
});

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
