import Phaser from 'phaser';
import { gearBonus } from '../data/gear';
import { WEAPONS } from '../data/weapons';
import { buildSlots } from './battleScene';
import { ctx, type StationId } from './context';
import { DEPTH } from './fx';
import { Player } from './player2d';
import { derive, totalStats } from './stats';
import { FLOOR_Y, GROUND_Y, VIEW_H, VIEW_W_MAX } from './world';

interface Station {
  id: StationId;
  name: string;
  verb: string;
  x: number;
}

const TOWN_W = 1500;

/** 옆으로 걸어 다니는 마을. NPC 앞에서 ↑로 대화해 창을 연다. */
export class TownScene extends Phaser.Scene {
  private player!: Player;
  private stations: Station[] = [];
  private mid!: Phaser.GameObjects.TileSprite;
  private prompts = new Map<StationId, Phaser.GameObjects.Container>();

  constructor() {
    super('town');
  }

  create(): void {
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
    this.addNpc('smith', '대장장이 브론', '강화 · 재료 교환', '대장장이와 대화', 340, 'npc-bearded');
    this.addProp('chest', '장비함', '무기 · 방어구 장착', '장비함 열기', 520, 'crate');
    this.addProp('board', '출정 게시판', '페이즈 선택 · 소탕', '게시판 보기', 820, 'sign');
    this.addNpc('shop', '잡화상 리나', '무기 · 장비 · 포션', '상인과 대화', 980, 'npc-woman');
    this.addNpc('trainer', '교관 메이린', '스탯 · 스킬 · 패시브', '교관과 대화', 1260, 'npc-oldman');
    this.add.sprite(1440, GROUND_Y + 6, 'npc-hatman').setOrigin(0.5, 1).setDepth(DEPTH.deco).play('npc-hatman').setFlipX(true);

    // 주인공 (마을에서는 공격하지 않는다)
    const stats = totalStats(save);
    const weapons = save.equipped.map((uid) => {
      const owned = save.weapons.find((w) => w.uid === uid) ?? save.weapons[0];
      const def = WEAPONS[owned.defId];
      return { def, enhance: owned.enhance, slots: buildSlots(save, def.type) };
    });
    this.player = new Player(this, 760, FLOOR_Y - 40, derive(stats, save.passives, gearBonus(save.gear.equipped)), weapons);
    this.physics.add.collider(this.player.zone, solids);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, TOWN_W, VIEW_H);
    cam.startFollow(this.player.zone, true, 0.12, 0.12, 0, 40);
    cam.fadeIn(300);

    ctx.townHud.show();
    this.events.once('shutdown', () => this.player.destroy());
  }

  private label(x: number, y: number, name: string, sub: string): Phaser.GameObjects.Container {
    const title = this.add
      .text(0, 0, name, {
        fontFamily: '"Black Han Sans", "Malgun Gothic", sans-serif',
        fontSize: '11px',
        color: '#f3d08a',
        stroke: '#1a0e06',
        strokeThickness: 3,
        resolution: 3,
      })
      .setOrigin(0.5, 1);
    const subText = this.add
      .text(0, 1, sub, {
        fontFamily: '"Noto Sans KR", "Malgun Gothic", sans-serif',
        fontSize: '7px',
        color: '#d9cbb0',
        stroke: '#1a0e06',
        strokeThickness: 2,
        resolution: 3,
      })
      .setOrigin(0.5, 0);
    return this.add.container(x, y, [title, subText]).setDepth(DEPTH.text);
  }

  private addNpc(id: StationId, name: string, sub: string, verb: string, x: number, sheet: string): void {
    const s = this.add.sprite(x, GROUND_Y + 6, sheet).setOrigin(0.5, 1).setDepth(DEPTH.deco + 1).play(sheet);
    this.label(x, s.y - s.height - 6, name, sub);
    this.stations.push({ id, name, verb, x });
    this.addPrompt(id, x, s.y - s.height - 26);
  }

  private addProp(id: StationId, name: string, sub: string, verb: string, x: number, key: string): void {
    const img = this.add.image(x, GROUND_Y + 6, key).setOrigin(0.5, 1).setDepth(DEPTH.deco + 1);
    this.label(x, img.y - img.height - 6, name, sub);
    this.stations.push({ id, name, verb, x });
    this.addPrompt(id, x, img.y - img.height - 26);
  }

  /** 가까이 가면 머리 위에 뜨는 ↑ 표시 */
  private addPrompt(id: StationId, x: number, y: number): void {
    const bubble = this.add.circle(0, 0, 7, 0xf3d08a).setStrokeStyle(1, 0x3a2508);
    const arrow = this.add.text(0, 0, '↑', { fontFamily: 'sans-serif', fontSize: '10px', color: '#2a1a08', resolution: 3 }).setOrigin(0.5);
    const c = this.add.container(x, y, [bubble, arrow]).setDepth(DEPTH.text).setVisible(false);
    this.tweens.add({ targets: c, y: y - 3, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    this.prompts.set(id, c);
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
    this.mid.tilePositionX = (this.cameras.main.scrollX * 0.3) / this.mid.scaleX;

    const near = ctx.windowOpen() ? null : this.nearest();
    for (const [id, c] of this.prompts) c.setVisible(near?.id === id);
    if (near && input.pressed('interact')) ctx.openStation(near.id, near.name);
    else if (input.pressed('menu') && !ctx.windowOpen()) ctx.openMenu();
    ctx.townHud.update(ctx.getSave(), near ? near.verb : null);
    input.endFrame();
  }
}
