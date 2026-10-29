import * as THREE from 'three';
import './style.css';
import { Input } from './core/input';
import { loadSave, newSave, writeSave, type SaveData } from './core/save';
import { PHASE_BY_ID } from './data/phases';
import { MATERIALS } from './data/items';
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
app.appendChild(renderer.domElement);

let save: SaveData = loadSave();
const input = new Input(renderer.domElement, save.keymap);
// 개발 서버에서 ?nolock 을 붙이면 포인터 잠금 없이 플레이한다 (자동화 테스트용).
if (import.meta.env.DEV && new URLSearchParams(location.search).has('nolock')) input.fakeLock = true;
const villageScene = new VillageScene();
let battle: Battle | null = null;

const village = new VillageUI(uiRoot, () => save, {
  onStartPhase: startPhase,
  onSaveChanged: () => {
    writeSave(save);
    input.setKeymap(save.keymap);
  },
  onImport: (s) => replaceSave(s),
  onReset: () => replaceSave(newSave()),
});
village.show();

function replaceSave(next: SaveData): void {
  save = next;
  input.setKeymap(save.keymap);
  writeSave(save);
}

function startPhase(id: string): void {
  const phase = PHASE_BY_ID[id];
  if (!phase || battle) return;
  village.hide();
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
    writeSave(save);
  }
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
      village.show();
    },
  );
}

window.addEventListener('resize', () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  villageScene.resize(w, h);
  battle?.resize(w, h);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (battle) {
    battle.update(dt);
    battle.render(renderer);
  } else {
    villageScene.update(dt);
    renderer.render(villageScene.scene, villageScene.camera);
    input.endFrame();
  }
});
