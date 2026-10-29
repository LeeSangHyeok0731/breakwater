import * as THREE from 'three';
import type { Input } from '../core/input';
import type { SaveData } from '../core/save';
import { WEAPONS } from '../data/weapons';
import { AnimatedModel } from './animated';
import type { CharacterName } from './assets';
import { CameraRig } from './cameraRig';
import { groundTexture, makeSky, placeProp, radialAlpha, scatterGrass } from './environment';
import { makeHeldWeapon } from './heldWeapons';
import { box, cone, cyl, ico, mat } from './models';
import { forwardOf, rightOf } from './player';

/** 마을에서 상호작용할 수 있는 곳 */
export type StationId = 'board' | 'smith' | 'shop' | 'trainer' | 'chest';

export interface Station {
  id: StationId;
  /** 창 제목·이름표 */
  name: string;
  /** 상호작용 안내 문구 */
  verb: string;
  pos: THREE.Vector3;
  npc: AnimatedModel | null;
  label: THREE.Sprite;
}

const WALK_SPEED = 5.6;
const TOWN_RADIUS = 24;
const INTERACT_RANGE = 2.6;

const HOUSES: [number, number, number][] = [
  [-10, -4, 0.6],
  [-6, 9, 2.4],
  [-1, 13, 3.0],
  [11, -6, -0.9],
  [0, -13, 0],
  [-12, 6, 1.8],
];

/** 이름표: 게임풍 판 위에 금색 글자 */
function makeLabel(text: string, sub: string): THREE.Sprite {
  const w = 512;
  const h = 160;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(20, 14, 10, 0.78)';
  ctx.strokeStyle = '#c9a14a';
  ctx.lineWidth = 6;
  const r = 28;
  ctx.beginPath();
  ctx.moveTo(r, 8);
  ctx.arcTo(w - 8, 8, w - 8, h - 8, r);
  ctx.arcTo(w - 8, h - 8, 8, h - 8, r);
  ctx.arcTo(8, h - 8, 8, 8, r);
  ctx.arcTo(8, 8, w - 8, 8, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#f3d08a';
  ctx.font = '700 56px "Black Han Sans", "Malgun Gothic", sans-serif';
  ctx.fillText(text, w / 2, 62);
  ctx.fillStyle = '#d9cbb0';
  ctx.font = '500 34px "Noto Sans KR", "Malgun Gothic", sans-serif';
  ctx.fillText(sub, w / 2, 118);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  sprite.scale.set(2.4, 0.75, 1);
  sprite.renderOrder = 20;
  return sprite;
}

/**
 * 걸어 다니는 마을. 플레이어가 직접 이동해 게시판·대장장이·상인·교관·장비함에 다가가 상호작용한다.
 */
export class Town {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 400);
  readonly rig: CameraRig;
  readonly stations: Station[] = [];
  /** 창이 열려 있으면 움직이지 않는다. */
  frozen = false;

  private hero: AnimatedModel;
  private heroWeapon: THREE.Object3D | null = null;
  private heroWeaponId = '';
  private readonly pos = new THREE.Vector3(0, 0, -3.5);
  private readonly vel = new THREE.Vector3();
  private sky!: THREE.Mesh;
  private fire!: THREE.Mesh;
  private fireLight!: THREE.PointLight;
  private time = 0;
  private colliders: { x: number; z: number; r: number }[] = [];

  constructor(
    private readonly input: Input,
    private readonly getSave: () => SaveData,
  ) {
    this.rig = new CameraRig(this.camera);
    this.rig.yaw = 0;
    this.rig.pitch = 0.2;
    this.buildWorld();
    this.hero = new AnimatedModel('Knight', {
      hide: ['1H_Sword', '1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Round_Shield', 'Spike_Shield'],
    });
    this.scene.add(this.hero.root);
    this.buildStations();
  }

  /** 전투에서 돌아오거나 처음 들어올 때 게시판 앞에 선다. */
  enter(): void {
    this.pos.set(0, 0, -3.2);
    this.vel.set(0, 0, 0);
    this.rig.yaw = Math.PI;
    this.rig.pitch = 0.18;
    this.rig.mode = this.getSave().viewMode;
    this.hero.root.rotation.y = this.rig.yaw;
    this.frozen = false;
    this.syncHeroWeapon();
  }

  /** 가장 가까운 상호작용 대상 (범위 밖이면 null) */
  nearest(): Station | null {
    let best: Station | null = null;
    let bestD = INTERACT_RANGE;
    for (const s of this.stations) {
      const d = Math.hypot(s.pos.x - this.pos.x, s.pos.z - this.pos.z);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  /** 상호작용 시작: NPC가 플레이어를 바라보며 반긴다. */
  greet(s: Station): void {
    if (!s.npc) return;
    s.npc.root.rotation.y = Math.atan2(this.pos.x - s.pos.x, this.pos.z - s.pos.z);
    s.npc.playFull('Interact', { loop: false, fade: 0.15 });
  }

  update(dt: number): void {
    this.time += dt;
    const input = this.input;
    const save = this.getSave();

    if (!this.frozen && input.locked) {
      this.rig.look(input, save.sensitivity);
      if (input.pressed('view')) save.viewMode = this.rig.toggle();
    }

    // 이동
    const f = forwardOf(this.rig.yaw);
    const r = rightOf(this.rig.yaw);
    let wx = 0;
    let wz = 0;
    if (!this.frozen && input.locked) {
      const fw = (input.isDown('forward') ? 1 : 0) - (input.isDown('back') ? 1 : 0);
      const rt = (input.isDown('right') ? 1 : 0) - (input.isDown('left') ? 1 : 0);
      wx = f.x * fw + r.x * rt;
      wz = f.z * fw + r.z * rt;
      const len = Math.hypot(wx, wz);
      if (len > 0) {
        wx /= len;
        wz /= len;
      }
    }
    const k = Math.min(1, dt * 12);
    this.vel.x += (wx * WALK_SPEED - this.vel.x) * k;
    this.vel.z += (wz * WALK_SPEED - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.collide();

    // 주인공 애니메이션
    const hero = this.hero;
    hero.root.position.copy(this.pos);
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (speed > 0.4) hero.root.rotation.y = this.rig.mode === 'first' ? this.rig.yaw : Math.atan2(this.vel.x, this.vel.z);
    else if (this.rig.mode === 'first') hero.root.rotation.y = this.rig.yaw;
    hero.playFull(speed > 0.6 ? 'Running_A' : 'Idle', { speed: speed > 0.6 ? THREE.MathUtils.clamp(speed / 5.5, 0.7, 1.4) : 1 });
    hero.update(dt);
    hero.setVisible(this.rig.mode !== 'first');
    if (this.heroWeapon) this.heroWeapon.visible = this.rig.mode !== 'first';
    this.syncHeroWeapon();

    // NPC: 가까이 오면 플레이어를 바라본다.
    for (const s of this.stations) {
      if (s.npc) {
        const d = Math.hypot(this.pos.x - s.pos.x, this.pos.z - s.pos.z);
        if (d < 6) {
          const want = Math.atan2(this.pos.x - s.pos.x, this.pos.z - s.pos.z);
          let diff = want - s.npc.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          s.npc.root.rotation.y += diff * Math.min(1, dt * 4);
        }
        if (s.npc.current('lower') === 'Interact' && !this.frozen) s.npc.playFull('Idle', { fade: 0.3 });
        s.npc.update(dt);
      }
      s.label.position.y = s.label.userData.baseY + Math.sin(this.time * 2 + s.pos.x) * 0.06;
    }

    this.rig.update(this.pos, dt);
    this.sky.position.copy(this.camera.position);
    this.fire.scale.set(1 + Math.sin(this.time * 9) * 0.08, 1 + Math.sin(this.time * 13) * 0.15, 1);
    this.fireLight.intensity = 16 + Math.sin(this.time * 11) * 3 + Math.sin(this.time * 7.3) * 2;
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** 장착한 첫 번째 무기를 손에 든다. */
  private syncHeroWeapon(): void {
    const save = this.getSave();
    const owned = save.weapons.find((w) => w.uid === save.equipped[0]);
    const id = owned?.defId ?? '';
    if (id === this.heroWeaponId || !this.hero.handR) return;
    if (this.heroWeapon) this.hero.handR.remove(this.heroWeapon);
    const def = WEAPONS[id];
    this.heroWeapon = def ? makeHeldWeapon(def.type, this.hero.root.children[0].scale.x) : null;
    if (this.heroWeapon) this.hero.handR.add(this.heroWeapon);
    this.heroWeaponId = id;
  }

  private collide(): void {
    const p = this.pos;
    for (const c of this.colliders) {
      const dx = p.x - c.x;
      const dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + 0.4;
      if (d < min && d > 1e-4) {
        p.x = c.x + (dx / d) * min;
        p.z = c.z + (dz / d) * min;
      }
    }
    const d = Math.hypot(p.x, p.z);
    if (d > TOWN_RADIUS) {
      p.x *= TOWN_RADIUS / d;
      p.z *= TOWN_RADIUS / d;
    }
  }

  private addStation(
    id: StationId,
    name: string,
    sub: string,
    verb: string,
    x: number,
    z: number,
    character: CharacterName | null,
    hide: string[] = [],
  ): Station {
    const pos = new THREE.Vector3(x, 0, z);
    let npc: AnimatedModel | null = null;
    if (character) {
      npc = new AnimatedModel(character, { hide });
      npc.root.position.copy(pos);
      npc.root.rotation.y = Math.atan2(-x, -z);
      npc.playFull('Idle');
      this.scene.add(npc.root);
      this.colliders.push({ x, z, r: 0.5 });
    }
    const label = makeLabel(name, sub);
    label.position.set(x, character ? 2.75 : 2.6, z);
    label.userData.baseY = label.position.y;
    this.scene.add(label);
    const s: Station = { id, name, verb, pos, npc, label };
    this.stations.push(s);
    return s;
  }

  private buildStations(): void {
    // 출정 게시판
    const board = new THREE.Group();
    const wood = mat(0x6b4a2a);
    for (const x of [-1.1, 1.1]) {
      const post = cyl(0.09, 0.11, 2.4, 6, wood);
      post.position.set(x, 1.2, 0);
      board.add(post);
    }
    const plank = box(2.6, 1.5, 0.12, mat(0x8a6038));
    plank.position.y = 1.55;
    board.add(plank);
    const roof = box(2.9, 0.12, 0.5, mat(0x5a3a22));
    roof.position.set(0, 2.38, 0.05);
    board.add(roof);
    const papers: [number, number, number][] = [
      [-0.7, 1.7, 0.05],
      [0.1, 1.6, -0.08],
      [0.8, 1.75, 0.1],
      [-0.3, 1.2, 0.0],
      [0.6, 1.15, 0.06],
    ];
    for (const [x, y, rz] of papers) {
      const p = box(0.5, 0.6, 0.02, mat(0xe8dcbc));
      p.position.set(x, y, 0.08);
      p.rotation.z = rz;
      board.add(p);
    }
    board.position.set(0, 0, -6.5);
    this.scene.add(board);
    this.colliders.push({ x: -1.1, z: -6.5, r: 0.35 }, { x: 0, z: -6.5, r: 0.35 }, { x: 1.1, z: -6.5, r: 0.35 });
    const boardStation = this.addStation('board', '출정 게시판', '페이즈 선택 · 소탕', '게시판 보기', 0, -5.6, null);
    boardStation.label.position.z = -6.5;

    // 대장장이: 모루와 화덕
    const smithX = -7;
    const smithZ = 1.5;
    const anvil = new THREE.Group();
    const anvilTop = box(0.9, 0.25, 0.4, mat(0x4a4e56));
    anvilTop.position.y = 0.75;
    anvil.add(anvilTop);
    const anvilBase = box(0.4, 0.6, 0.35, mat(0x3a3e46));
    anvilBase.position.y = 0.35;
    anvil.add(anvilBase);
    anvil.position.set(smithX + 1.2, 0, smithZ + 0.4);
    this.scene.add(anvil);
    const forge = box(1.4, 1.1, 1.2, mat(0x6a5a50));
    forge.position.set(smithX - 1.3, 0.55, smithZ - 0.6);
    this.scene.add(forge);
    const coals = box(0.9, 0.1, 0.7, mat(0xff6a1a, 0xff4a0a, 3));
    coals.position.set(smithX - 1.3, 1.12, smithZ - 0.6);
    this.scene.add(coals);
    const forgeLight = new THREE.PointLight(0xff7a2a, 8, 7, 1.8);
    forgeLight.position.set(smithX - 1.3, 1.6, smithZ - 0.6);
    this.scene.add(forgeLight);
    this.colliders.push({ x: smithX + 1.2, z: smithZ + 0.4, r: 0.5 }, { x: smithX - 1.3, z: smithZ - 0.6, r: 0.9 });
    this.addStation('smith', '대장장이 브론', '강화 · 재료 교환', '대장장이와 대화', smithX, smithZ, 'Barbarian', [
      '1H_Axe_Offhand',
      'Barbarian_Round_Shield',
      '2H_Axe',
      'Mug',
    ]);

    // 상인: 좌판과 차양
    const shopX = 7.2;
    const shopZ = 0.5;
    const stall = new THREE.Group();
    const table = box(2.4, 0.9, 0.9, mat(0x7a5432));
    table.position.y = 0.45;
    stall.add(table);
    for (const [x, c] of [
      [-0.7, 0xd84a3a],
      [0, 0x4a8ad8],
      [0.7, 0x5ac85a],
    ] as const) {
      const potion = ico(0.12, mat(c, c, 0.6), 1);
      potion.position.set(x, 1.02, 0);
      stall.add(potion);
    }
    for (const x of [-1.15, 1.15]) {
      const pole = cyl(0.05, 0.05, 2.3, 5, mat(0x5a3a22));
      pole.position.set(x, 1.15, 0.35);
      stall.add(pole);
    }
    const awning = box(2.7, 0.08, 1.2, mat(0xc85a3a));
    awning.position.set(0, 2.3, 0.1);
    awning.rotation.x = -0.18;
    stall.add(awning);
    stall.position.set(shopX + 0.2, 0, shopZ - 1.1);
    stall.rotation.y = -0.4;
    this.scene.add(stall);
    this.colliders.push({ x: shopX + 0.2, z: shopZ - 1.1, r: 1.2 });
    this.addStation('shop', '잡화상 리나', '무기 · 장비 · 포션', '상인과 대화', shopX, shopZ, 'Rogue', [
      'Knife_Offhand',
      '1H_Crossbow',
      '2H_Crossbow',
      'Throwable',
    ]);

    // 교관
    this.addStation('trainer', '교관 메이린', '스탯 · 스킬 · 패시브', '교관과 대화', 4.2, 7.2, 'Mage', ['Spellbook_open', '1H_Wand']);
    const dummy = new THREE.Group();
    const dpost = cyl(0.08, 0.08, 1.6, 6, mat(0x6b4a2a));
    dpost.position.y = 0.8;
    dummy.add(dpost);
    const dbody = cyl(0.3, 0.3, 0.8, 8, mat(0xc8a870));
    dbody.position.y = 1.3;
    dummy.add(dbody);
    const dhead = ico(0.22, mat(0xc8a870), 1);
    dhead.position.y = 1.9;
    dummy.add(dhead);
    dummy.position.set(6.2, 0, 8.6);
    this.scene.add(dummy);
    this.colliders.push({ x: 6.2, z: 8.6, r: 0.4 });

    // 장비함
    const chest = new THREE.Group();
    const cbox = box(1.1, 0.6, 0.7, mat(0x7a4a26));
    cbox.position.y = 0.3;
    chest.add(cbox);
    const clid = box(1.14, 0.22, 0.74, mat(0x6a3a1a));
    clid.position.y = 0.7;
    chest.add(clid);
    const band = box(1.16, 0.08, 0.76, mat(0xc9a14a, 0x3a2a00));
    band.position.y = 0.6;
    chest.add(band);
    const lock = box(0.14, 0.18, 0.05, mat(0xe0b45a, 0x5a3a00));
    lock.position.set(0, 0.55, 0.38);
    chest.add(lock);
    chest.position.set(-3.6, 0, -3.8);
    chest.rotation.y = 0.7;
    this.scene.add(chest);
    this.colliders.push({ x: -3.6, z: -3.8, r: 0.6 });
    this.addStation('chest', '장비함', '무기 · 방어구 장착', '장비함 열기', -3.6, -3.8, null);
  }

  private buildWorld(): void {
    const scene = this.scene;
    scene.background = new THREE.Color(0xf4b88a);
    scene.fog = new THREE.Fog(0xf4b88a, 34, 110);
    this.sky = makeSky(0x6a5aa0, 0xf6b080, 0x5a5030);
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a3a28, 1.1));
    const sun = new THREE.DirectionalLight(0xffb880, 2.2);
    sun.position.set(-20, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28 });
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(140, 48),
      new THREE.MeshStandardMaterial({ map: groundTexture('#668a40', '#4f7032', '#80a04c', 5, 50), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(10, 40),
      new THREE.MeshStandardMaterial({
        map: groundTexture('#a8987a', '#8a7a5e', '#bcae90', 6, 3),
        alphaMap: radialAlpha(0.8),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    scene.add(plaza);
    scene.add(
      scatterGrass(2600, 9, 45, [0x5f9a3a, 0x6faa44, 0x4f8a34, 0x9ab04a], 9, (x, z) =>
        HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.2),
      ),
    );

    const walls = [0xe8dcc0, 0xd8c8a8, 0xf0e4d0];
    const roofs = [0xb5492f, 0x7a4a8a, 0x3a6a9a];
    HOUSES.forEach(([x, z, ry], i) => {
      const h = new THREE.Group();
      const body = box(4, 3, 3.5, mat(walls[i % 3]));
      body.position.y = 1.5;
      h.add(body);
      const beam = box(4.1, 0.25, 3.6, mat(0x6b4a2a));
      beam.position.y = 3;
      h.add(beam);
      const roof = cone(3.4, 2.2, 4, mat(roofs[i % 3]));
      roof.position.y = 4.1;
      roof.rotation.y = Math.PI / 4;
      h.add(roof);
      const door = box(0.9, 1.6, 0.1, mat(0x5a3a22));
      door.position.set(0, 0.8, 1.76);
      h.add(door);
      const win = box(0.7, 0.6, 0.1, mat(0xffe08a, 0xffb040, 1.6));
      win.position.set(1.2, 1.9, 1.76);
      h.add(win);
      const chimney = box(0.5, 1.2, 0.5, mat(0x8a7a6a));
      chimney.position.set(-1.1, 4.4, -0.6);
      h.add(chimney);
      h.position.set(x, 0, z);
      h.rotation.y = ry;
      scene.add(h);
      this.colliders.push({ x, z, r: 2.6 });
    });

    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2 + Math.sin(i * 7) * 0.2;
      const r = 28 + (i % 5) * 4;
      const name = i % 3 === 0 ? 'tree_pine_yellow_large' : i % 3 === 1 ? 'tree_pine_orange_large' : 'tree_pine_orange_medium';
      placeProp(scene, name, Math.cos(a) * r, Math.sin(a) * r, i, 1.6 + (i % 4) * 0.2);
    }

    placeProp(scene, 'bench', -3.4, 3.2, 0.9, 1.1);
    placeProp(scene, 'bench', 2.6, -3.0, -2.6, 1.1);
    placeProp(scene, 'pumpkin_orange_jackolantern', 2.6, 3.4, -0.6, 1.2);
    placeProp(scene, 'pumpkin_orange', 3.1, 3.9, 0.4, 1);
    placeProp(scene, 'post_lantern', -5.8, -3.6, 0.5, 1.3);
    placeProp(scene, 'post_lantern', 5.4, 4.4, 2.4, 1.3);
    placeProp(scene, 'lantern_standing', -1.8, -7.6, 0, 1.2);
    this.colliders.push({ x: -3.4, z: 3.2, r: 0.7 }, { x: 2.6, z: -3.0, r: 0.7 }, { x: -5.8, z: -3.6, r: 0.3 }, { x: 5.4, z: 4.4, r: 0.3 });

    // 광장 가운데 모닥불
    for (let i = 0; i < 7; i++) {
      const s = ico(0.25, mat(0x8a8a84));
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.75, 0.15, Math.sin(a) * 0.75);
      scene.add(s);
    }
    this.fire = cone(0.45, 1.1, 6, mat(0xff8a2a, 0xff6a0a, 4));
    this.fire.position.y = 0.55;
    scene.add(this.fire);
    this.fireLight = new THREE.PointLight(0xff9a40, 18, 14, 1.6);
    this.fireLight.position.y = 1.2;
    scene.add(this.fireLight);
    this.colliders.push({ x: 0, z: 0, r: 0.9 });
  }
}
