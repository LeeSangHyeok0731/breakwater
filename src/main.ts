import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import './style.css';
import { Input } from './core/input';
import { sfx } from './core/audio';
import { loadSave, newSave, writeSave, type SaveData } from './core/save';
import { PHASE_BY_ID } from './data/phases';
import type { MonsterKind } from './data/monsters';
import { MATERIALS } from './data/items';
import { loadAssets } from './game/assets';
import { Battle, type BattleOutcome } from './game/battle';
import { addExp } from './game/stats';
import { VillageScene } from './game/villageScene';
import { VillageUI } from './ui/village';

const app = document.getElementById('app')!;
const uiRoot = document.getElementById('ui')!;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

// 후처리: 마법·불꽃·눈빛처럼 밝은 부분이 은은하게 번진다.
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 0.85);
composer.addPass(renderPass);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let save: SaveData = loadSave();
const input = new Input(renderer.domElement, save.keymap);
// 개발 서버에서 ?nolock 을 붙이면 포인터 잠금 없이 플레이한다 (자동화 테스트용).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('nolock')) input.fakeLock = true;
sfx.setVolume(save.sfxVolume);
// 브라우저는 사용자 입력이 있어야 소리를 낼 수 있다.
window.addEventListener('pointerdown', () => sfx.unlock());
window.addEventListener('keydown', () => sfx.unlock());

let villageScene: VillageScene | null = null;
let village: VillageUI | null = null;
let battle: Battle | null = null;

function replaceSave(next: SaveData): void {
  save = next;
  input.setKeymap(save.keymap);
  sfx.setVolume(save.sfxVolume);
  writeSave(save);
}

function startPhase(id: string): void {
  const phase = PHASE_BY_ID[id];
  if (!phase || battle) return;
  village?.hide();
  battle = new Battle(input, save, phase, uiRoot, onBattleEnd);
}

/** 클리어하면 보상을 지급하고, 실패하면 이번 판 보상은 모두 사라진다. */
function onBattleEnd(o: BattleOutcome): void {
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
  const current = battle;
  current?.hud.showResult(
    {
      cleared: o.cleared,
      phaseName: `${o.phase.id} ${o.phase.name}`,
      gold: o.gold,
      exp: o.exp,
      materials: Object.entries(o.materials).map(([id, count]) => ({ name: MATERIALS[id]?.name ?? id, count })),
      kills: o.kills,
      levelsGained,
    },
    () => {
      current?.dispose();
      battle = null;
      village?.show();
    },
  );
}

function render(): void {
  if (battle) {
    renderPass.scene = battle.scene;
    renderPass.camera = battle.camera;
  } else if (villageScene) {
    renderPass.scene = villageScene.scene;
    renderPass.camera = villageScene.camera;
  } else return;
  composer.render();
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  villageScene?.resize(w, h);
  battle?.resize(w, h);
});

/** 에셋을 불러오는 동안 로딩 화면을 보여 준다. */
async function init(): Promise<void> {
  const loading = document.createElement('div');
  loading.className = 'loading-screen';
  const title = document.createElement('div');
  title.className = 'loading-title';
  title.textContent = '파도막이';
  const bar = document.createElement('div');
  bar.className = 'loading-bar';
  const fill = document.createElement('div');
  fill.className = 'loading-fill';
  bar.appendChild(fill);
  const text = document.createElement('div');
  text.className = 'loading-text';
  text.textContent = '불러오는 중...';
  loading.append(title, bar, text);
  uiRoot.appendChild(loading);

  try {
    await loadAssets((r) => {
      fill.style.width = `${Math.round(r * 100)}%`;
    });
  } catch (e) {
    text.textContent = `에셋을 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`;
    return;
  }
  loading.remove();

  villageScene = new VillageScene();
  village = new VillageUI(uiRoot, () => save, {
    onStartPhase: startPhase,
    onSaveChanged: () => {
      writeSave(save);
      input.setKeymap(save.keymap);
      sfx.setVolume(save.sfxVolume);
    },
    onImport: (s) => replaceSave(s),
    onReset: () => replaceSave(newSave()),
  });
  village.show();
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (battle) battle.update(dt);
  else {
    villageScene?.update(dt);
    input.endFrame();
  }
  render();
});

void init();

// 개발 서버 전용: 자동화 테스트에서 화면 갱신이 멈춰도 게임을 원하는 만큼 진행시킨다.
// 예) __bw.step(120) — 60fps 기준 2초 진행
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__bw = {
    step(frames = 60, dt = 1 / 60): string {
      for (let i = 0; i < frames && battle; i++) battle.update(dt);
      render();
      return battle ? battle.debugSummary() : 'no battle';
    },
    get battle(): Battle | null {
      return battle;
    },
    spawn(kind: MonsterKind, elite = false): string {
      battle?.spawnMonster(kind, elite);
      return battle ? battle.debugSummary() : 'no battle';
    },
  };
}
