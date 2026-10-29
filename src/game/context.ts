import type { Input } from '../core/input';
import type { SaveData } from '../core/save';
import type { PhaseDef } from '../data/phases';
import type { Hud } from '../ui/hud';
import type { TownHud } from '../ui/townHud';

export interface BattleOutcome {
  cleared: boolean;
  phase: PhaseDef;
  gold: number;
  exp: number;
  materials: Record<string, number>;
  sweepTickets: number;
  kills: number;
}

export type StationId = 'board' | 'smith' | 'shop' | 'trainer' | 'chest';

/** Phaser 씬과 HTML UI(창·HUD)를 잇는 공용 객체. main.ts가 채운다. */
export interface GameContext {
  input: Input;
  uiRoot: HTMLElement;
  townHud: TownHud;
  getSave(): SaveData;
  writeSave(): void;
  /** 마을 창이 열려 있는가 */
  windowOpen(): boolean;
  openStation(id: StationId, name: string): void;
  openMenu(): void;
  /** 전투가 끝났다. 결과 창을 띄우고, 확인하면 마을로 돌아간다. */
  onBattleEnd(outcome: BattleOutcome, hud: Hud, backToTown: () => void): void;
}

export const ctx = {} as GameContext;
