import Phaser from 'phaser';
import { createAnimations, preloadAssets } from './assets2d';
import { createClassSprites } from './classSprites';
import { createFxArt } from './fxArt';

/** 에셋을 불러오고 애니메이션을 만든 뒤 마을로 간다. 진행률은 HTML 로딩 화면에 표시한다. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly onProgress: (ratio: number) => void, private readonly onDone: () => void) {
    super('boot');
  }

  preload(): void {
    this.load.on('progress', (r: number) => this.onProgress(r));
    preloadAssets(this);
  }

  create(): void {
    createAnimations(this);
    createClassSprites(this);
    createFxArt(this);
    this.onDone();
    this.scene.start('town');
  }
}
