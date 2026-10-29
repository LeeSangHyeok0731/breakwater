import * as THREE from 'three';
import { AnimatedModel } from './animated';
import { groundTexture, makeSky, placeProp, radialAlpha, scatterGrass } from './environment';
import { box, cone, ico, mat } from './models';

/** 마을 화면 뒤에 보이는 배경 씬. 카메라가 마을 한쪽에서 천천히 좌우로 움직인다. */
export class VillageScene {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 400);
  private time = 0;
  private fire: THREE.Mesh;
  private fireLight: THREE.PointLight;
  private hero: AnimatedModel;
  private sky: THREE.Mesh;

  constructor() {
    const scene = this.scene;
    scene.background = new THREE.Color(0xf4b88a);
    scene.fog = new THREE.Fog(0xf4b88a, 32, 110);
    this.sky = makeSky(0x6a5aa0, 0xf6b080, 0x5a5030);
    scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(0xffe2c4, 0x4a3a28, 1.1));
    const sun = new THREE.DirectionalLight(0xffb880, 2.2);
    sun.position.set(-20, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26 });
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(140, 48),
      new THREE.MeshStandardMaterial({ map: groundTexture('#668a40', '#4f7032', '#80a04c', 5, 50), roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const plaza = new THREE.Mesh(
      new THREE.CircleGeometry(8.5, 40),
      new THREE.MeshStandardMaterial({
        map: groundTexture('#a8987a', '#8a7a5e', '#bcae90', 6, 3),
        alphaMap: radialAlpha(0.78),
        transparent: true,
        depthWrite: false,
        roughness: 1,
      }),
    );
    plaza.rotation.x = -Math.PI / 2;
    plaza.position.y = 0.01;
    plaza.receiveShadow = true;
    scene.add(plaza);
    scene.add(scatterGrass(2400, 7, 45, [0x5f9a3a, 0x6faa44, 0x4f8a34, 0x9ab04a], 9, (x, z) => houseAt(x, z)));

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
    });

    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2 + Math.sin(i * 7) * 0.2;
      const r = 27 + (i % 5) * 4;
      const name = i % 3 === 0 ? 'tree_pine_yellow_large' : i % 3 === 1 ? 'tree_pine_orange_large' : 'tree_pine_orange_medium';
      placeProp(scene, name, Math.cos(a) * r, Math.sin(a) * r, i, 1.6 + (i % 4) * 0.2);
    }

    // 광장 소품
    placeProp(scene, 'bench', -3.2, 2.6, 0.9, 1.1);
    placeProp(scene, 'bench', 3.4, -2.4, -2.3, 1.1);
    placeProp(scene, 'pumpkin_orange_jackolantern', 2.6, 2.8, -0.6, 1.2);
    placeProp(scene, 'pumpkin_orange', 3.1, 3.3, 0.4, 1);
    placeProp(scene, 'post_lantern', -5.5, -3, 0.5, 1.3);
    placeProp(scene, 'post_lantern', 5.8, 3.4, 2.4, 1.3);
    placeProp(scene, 'lantern_standing', -1.6, -4.2, 0, 1.2);

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

    this.hero = new AnimatedModel('Knight', {
      hide: ['1H_Sword_Offhand', '2H_Sword', 'Badge_Shield', 'Rectangle_Shield', 'Spike_Shield'],
    });
    this.hero.root.position.set(1.8, 0, 1.2);
    this.hero.root.rotation.y = -2.3;
    this.hero.playFull('Idle');
    scene.add(this.hero.root);
  }

  update(dt: number): void {
    this.time += dt;
    const a = 0.6 + Math.sin(this.time * 0.06) * 0.45;
    this.camera.position.set(Math.cos(a) * 21, 12, Math.sin(a) * 21);
    this.camera.lookAt(-2, 0.5, 0);
    this.sky.position.copy(this.camera.position);
    this.fire.scale.set(1 + Math.sin(this.time * 9) * 0.08, 1 + Math.sin(this.time * 13) * 0.15, 1);
    this.fireLight.intensity = 16 + Math.sin(this.time * 11) * 3 + Math.sin(this.time * 7.3) * 2;
    this.hero.update(dt);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

const HOUSES: [number, number, number][] = [
  [-10, -4, 0.6],
  [-6, 9, 2.4],
  [-1, 13, 3.0],
  [11, -6, -0.9],
  [0, -13, 0],
  [-12, 6, 1.8],
];

function houseAt(x: number, z: number): boolean {
  return HOUSES.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 3.2);
}
