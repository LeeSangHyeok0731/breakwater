import Phaser from 'phaser';
import { gearBonus } from '../data/gear';
import { WEAPONS } from '../data/weapons';
import { buildSlots } from './battleScene';
import { ctx, type Area, type StationId } from './context';
import { DEPTH } from './fx';
import { Player } from './player2d';
import { derive, totalStats } from './stats';
import { buildLevel, FLOOR_Y, GROUND_Y, VIEW_H, VIEW_W_MAX, type Level } from './world';
import { LEGION_UNLOCK_PHASE } from '../data/legion';

interface Station {
  id: StationId;
  name: string;
  verb: string;
  x: number;
  /** 이름판을 띄울 높이 (월드 좌표, 머리 위) */
  labelY: number;
  plate: HTMLDivElement;
}

const TOWN_W = 1500;
const BASE_W = 1200;

/** 옆으로 걸어 다니는 마을. NPC 앞에서 ↑로 대화해 창을 연다. */
export class TownScene extends Phaser.Scene {
  private player!: Player;
  private stations: Station[] = [];
  private mid: Phaser.GameObjects.TileSprite | null = null;
  private level: Level | null = null;
  area: Area = 'town';
  /** 선명하게 보이도록 이름판은 게임 화면 위에 겹친 HTML로 그린다. */
  private labelLayer!: HTMLDivElement;

  constructor() {
    super('town');
  }

  init(data: { area?: Area }): void {
    this.area = data?.area ?? 'town';
    this.mid = null;
    this.level = null;
  }

  create(): void {
    if (this.area === 'base') {
      this.createBase();
      return;
    }
    const save = ctx.getSave();
    this.cameras.main.setBackgroundColor('#1a1430');
    this.physics.world.setBounds(0, -200, TOWN_W, VIEW_H + 400);

    // 배경: 먼 하늘·성은 고정, 가까운 숲은 천천히 흐른다.
    const bg = this.add.image(VIEW_W_MAX / 2, VIEW_H / 2, 'town-bg').setScrollFactor(0).setDepth(DEPTH.bg);
    bg.setScale(Math.max(VIEW_W_MAX / bg.width, VIEW_H / bg.height));
    const midTex = this.textures.get('town-mid').getSourceImage() as HTMLImageElement;
    const midScale = VIEW_H / midTex.height;
    this.mid = this.add
      .tileSprite(0, 0, VIEW_W_MAX / midScale, midTex.height, 'town-mid')
      .setOrigin(0, 0)
      .setScale(midScale)
      .setScrollFactor(0)
      .setDepth(DEPTH.bg + 1);

    // 땅
    this.add.tileSprite(-48, GROUND_Y + 4, TOWN_W + 96, 32, 'town-tiles', 'ground').setOrigin(0, 0).setDepth(DEPTH.platform);
    this.add.rectangle(-48, GROUND_Y + 34, TOWN_W + 96, VIEW_H, 0x1a1222).setOrigin(0, 0).setDepth(DEPTH.platform);
    const solids = this.physics.add.staticGroup();
    solids.add(this.add.zone(TOWN_W / 2, FLOOR_Y + 40, TOWN_W + 200, 80));

    // 집과 소품
    const onGround = (key: string, x: number, depth = DEPTH.deco, flip = false): Phaser.GameObjects.Image =>
      this.add.image(x, GROUND_Y + 6, key).setOrigin(0.5, 1).setDepth(depth).setFlipX(flip);
    onGround('house-a', 150, DEPTH.deco - 3);
    onGround('house-b', 620, DEPTH.deco - 3);
    onGround('house-c', 1180, DEPTH.deco - 3);
    onGround('street-lamp', 420);
    onGround('street-lamp', 900);
    onGround('street-lamp', 1400);
    onGround('well', 760);
    onGround('crate-stack', 270);
    onGround('barrel', 300);
    onGround('wagon', 1040, DEPTH.deco, true);
    onGround('barrel', 1330);
    onGround('crate', 1360);

    // 상호작용 대상
    this.stations = [];
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'town-labels';
    ctx.uiRoot.appendChild(this.labelLayer);
    this.addNpc('smith', '대장장이 브론', '강화 · 재료 교환', '대장장이와 대화', 340, 'npc-bearded');
    this.makeStationTextures();
    this.addProp('chest', '장비함', '무기 · 방어구 장착', '장비함 열기', 520, 'town-chest');
    this.addProp('board', '출정 게시판', '페이즈 선택 · 소탕', '게시판 보기', 820, 'quest-board');
    this.addNpc('shop', '잡화상 리나', '무기 · 장비 · 포션', '상인과 대화', 980, 'npc-woman');
    this.addNpc('trainer', '교관 메이린', '스탯 · 스킬 · 패시브', '교관과 대화', 1260, 'npc-oldman');
    // 5-5를 깨면 마을 끝에 전투 기지로 가는 포탈이 열린다.
    if (save.cleared.includes(LEGION_UNLOCK_PHASE)) this.addPortal('전투 기지 포탈', '군단장 토벌 준비', '포탈 타기', 1440);
    else this.add.sprite(1440, GROUND_Y + 6, 'npc-hatman').setOrigin(0.5, 1).setDepth(DEPTH.deco).play('npc-hatman').setFlipX(true);

    this.spawnPlayer(760, solids, TOWN_W);
  }

  /** 전투 기지: 성 안. 군단장 토벌을 준비한다. */
  private createBase(): void {
    this.physics.world.setBounds(0, -200, BASE_W, VIEW_H + 400);
    this.level = buildLevel(this, BASE_W, [], 'castle', 77);
    this.stations = [];
    this.labelLayer = document.createElement('div');
    this.labelLayer.className = 'town-labels';
    ctx.uiRoot.appendChild(this.labelLayer);
    this.addPortal('귀환 포탈', '마을로 돌아가기', '포탈 타기', 90);
    this.addNpc('armory', '무기고 관리인 그렌', '군단장별 무기 선택', '무기 고르기', 330, 'npc-bearded', 0xc8b0a0);
    // 작전 지휘관: 푸른 갑옷의 기사
    const cmd = this.add.sprite(600, GROUND_Y + 6, 'dao:hero-idle').setOrigin(0.5, 1).setDepth(DEPTH.deco + 1).play('dao:hero-idle').setFlipX(true);
    this.stations.push({ id: 'legion', name: '작전 지휘관 레온', verb: '작전 듣기', x: 600, labelY: cmd.y - 50, plate: this.plate('legion', '작전 지휘관 레온', '군단장 토벌 · 출격', '작전 듣기') });
    this.addNpc('shards', '조각 상인 세라', '조각으로 세트 방어구', '상인과 대화', 880, 'npc-woman', 0xd0b8ff);
    this.spawnPlayer(600, this.level.solids, BASE_W);
  }

  private spawnPlayer(x: number, solids: Phaser.Physics.Arcade.StaticGroup, width: number): void {
    const save = ctx.getSave();
    // 주인공 (마을에서는 공격하지 않는다)
    const stats = totalStats(save);
    const weapons = save.equipped.map((uid) => {
      const owned = save.weapons.find((w) => w.uid === uid) ?? save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(save, def.type) };
    });
    this.player = new Player(this, x, FLOOR_Y - 40, derive(stats, save.passives, gearBonus(save.gear.equipped, save.gear.enhance)), weapons);
    this.physics.add.collider(this.player.zone, solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, width, VIEW_H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.fadeIn(300);

    ctx.townHud.show();
    this.events.once('shutdown', () => {
      this.player.destroy();
      this.labelLayer.remove();
    });
  }

  /** 게시판과 장비함은 알아보기 쉽도록 픽셀 그림을 직접 그린다. */
  private makeStationTextures(): void {
    if (!this.textures.exists('quest-board')) {
      const g = this.make.graphics({}, false);
      // 기둥
      g.fillStyle(0x3a2414).fillRect(4, 14, 4, 50).fillRect(52, 14, 4, 50);
      // 지붕
      g.fillStyle(0x5a2a1a).fillRect(0, 8, 60, 6);
      g.fillStyle(0x7a3a24).fillRect(2, 6, 56, 3);
      // 판
      g.fillStyle(0x6b4526).fillRect(8, 16, 44, 32);
      g.fillStyle(0x4a2e18).fillRect(8, 16, 44, 2).fillRect(8, 46, 44, 2);
      // 붙어 있는 의뢰서
      const notes: [number, number, number, number][] = [
        [11, 20, 12, 14],
        [26, 19, 11, 12],
        [39, 21, 10, 15],
        [14, 35, 10, 10],
        [30, 33, 13, 11],
      ];
      for (const [x, y, w, h] of notes) {
        g.fillStyle(0xe8dcbc).fillRect(x, y, w, h);
        g.fillStyle(0xb8a888).fillRect(x + 2, y + 3, w - 4, 1).fillRect(x + 2, y + 6, w - 5, 1);
        g.fillStyle(0xc83a2a).fillRect(x + Math.floor(w / 2) - 1, y, 2, 2);
      }
      // 칼 문양: 출정
      g.fillStyle(0xd8ae5a).fillRect(29, 45, 2, 8).fillRect(26, 50, 8, 2);
      g.generateTexture('quest-board', 60, 64);
      g.destroy();
    }
    if (!this.textures.exists('town-chest')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x2a1810).fillRect(0, 6, 32, 20);
      g.fillStyle(0x7a4a26).fillRect(1, 9, 30, 16);
      g.fillStyle(0x8a5a30).fillRect(1, 2, 30, 7);
      g.fillStyle(0x5a3418).fillRect(1, 8, 30, 2);
      g.fillStyle(0xd8ae5a).fillRect(1, 2, 3, 23).fillRect(28, 2, 3, 23).fillRect(1, 2, 30, 2);
      g.fillStyle(0xf6d68e).fillRect(13, 8, 6, 7);
      g.fillStyle(0x3a2508).fillRect(15, 11, 2, 3);
      g.generateTexture('town-chest', 32, 26);
      g.destroy();
    }
  }

  /** 이름판: 이름, 하는 일, 가까이 가면 '↑ 대화' 안내 */
  private plate(id: StationId, name: string, sub: string, verb: string): HTMLDivElement {
    const plate = document.createElement('div');
    plate.className = `tl-plate tl-${id}`;
    const title = document.createElement('div');
    title.className = 'tl-name';
    title.textContent = name;
    const desc = document.createElement('div');
    desc.className = 'tl-sub';
    desc.textContent = sub;
    const prompt = document.createElement('div');
    prompt.className = 'tl-prompt';
    const key = document.createElement('span');
    key.className = 'th-key small';
    key.textContent = '↑';
    const text = document.createElement('span');
    text.textContent = verb;
    prompt.append(key, text);
    plate.append(prompt, title, desc);
    this.labelLayer.appendChild(plate);
    return plate;
  }

  private addNpc(id: StationId, name: string, sub: string, verb: string, x: number, sheet: string, tint?: number): void {
    const s = this.add.sprite(x, GROUND_Y + 6, sheet).setOrigin(0.5, 1).setDepth(DEPTH.deco + 1).play(sheet);
    if (tint !== undefined) s.setTint(tint);
    this.stations.push({ id, name, verb, x, labelY: s.y - s.height - 4, plate: this.plate(id, name, sub, verb) });
  }

  /** 소용돌이치는 보라 포탈 */
  private addPortal(name: string, sub: string, verb: string, x: number): void {
    if (!this.textures.exists('portal-gate')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x2a1a3a).fillRect(0, 10, 6, 54).fillRect(38, 10, 6, 54);
      g.fillStyle(0x4a3a5a).fillRect(0, 4, 44, 8);
      g.fillStyle(0x6a5a7a).fillRect(2, 4, 40, 2);
      g.fillStyle(0x3a1a6a).fillEllipse(22, 38, 32, 50);
      g.fillStyle(0x7a3ad8).fillEllipse(22, 38, 24, 42);
      g.fillStyle(0xc090ff).fillEllipse(22, 38, 12, 26);
      g.fillStyle(0xffffff).fillEllipse(22, 38, 4, 10);
      g.generateTexture('portal-gate', 44, 64);
      g.destroy();
    }
    const img = this.add.image(x, GROUND_Y + 6, 'portal-gate').setOrigin(0.5, 1).setDepth(DEPTH.deco + 1);
    // 빛이 일렁인다.
    const glow = this.add.ellipse(x, GROUND_Y - 26, 30, 46, 0xb070ff, 0.35).setDepth(DEPTH.deco + 2).setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({ targets: glow, scaleX: 1.15, scaleY: 1.08, alpha: 0.15, duration: 900, yoyo: true, repeat: -1 });
    this.stations.push({ id: 'portal', name, verb, x, labelY: img.y - img.height - 4, plate: this.plate('portal', name, sub, verb) });
  }

  private addProp(id: StationId, name: string, sub: string, verb: string, x: number, key: string): void {
    const img = this.add.image(x, GROUND_Y + 6, key).setOrigin(0.5, 1).setDepth(DEPTH.deco + 1);
    this.stations.push({ id, name, verb, x, labelY: img.y - img.height - 4, plate: this.plate(id, name, sub, verb) });
  }

  /** 월드 좌표를 화면(브라우저) 좌표로 바꿔 이름판을 따라붙인다. */
  private placeLabels(near: Station | null): void {
    const rect = this.game.canvas.getBoundingClientRect();
    const k = rect.width / this.scale.width;
    const cam = this.cameras.main;
    for (const st of this.stations) {
      const x = rect.left + (st.x - cam.scrollX) * k;
      const y = rect.top + (st.labelY - cam.scrollY) * k;
      st.plate.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
      st.plate.classList.toggle('near', near === st);
    }
    this.labelLayer.style.display = ctx.windowOpen() ? 'none' : '';
  }

  private nearest(): Station | null {
    let best: Station | null = null;
    let bestD = 34;
    for (const s of this.stations) {
      const d = Math.abs(s.x - this.player.x);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const input = ctx.input;
    const p = this.player;
    p.updateTimers(dt);
    if (input.pressed('dodge') && p.dodgeCd <= 0) p.startDodge();
    p.updateMovement(dt, input);
    p.animate();
    if (this.mid) this.mid.tilePositionX = (this.cameras.main.scrollX * 0.3) / this.mid.scaleX;
    this.level?.update();

    const near = ctx.windowOpen() ? null : this.nearest();
    this.placeLabels(near);
    if (near && input.pressed('interact')) ctx.openStation(near.id, near.name);
    else if (input.pressed('menu') && !ctx.windowOpen()) ctx.openMenu();
    else if (input.pressed('inventory') && !ctx.windowOpen()) ctx.openPanel('equip');
    else if (input.pressed('skills') && !ctx.windowOpen()) ctx.openPanel('skill');
    // 대화 안내는 이름판 위에 붙어 나오므로 HUD 가운데 안내는 쓰지 않는다.
    ctx.townHud.update(ctx.getSave(), null);
    input.endFrame();
  }
}
