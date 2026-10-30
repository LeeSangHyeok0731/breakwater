import type { MonsterKind } from '../../data/monsters';
import type { Behavior, Pattern } from '../monster2d';

// 챕터 3(마왕성) 몬스터의 행동

export const CHAPTER3: Partial<Record<MonsterKind, Behavior>> = {};

/** 심연의 군주가 악마 군주 행동에 더해 쓰는 패턴 */
export const ABYSS_PATTERNS: Partial<Record<Pattern, Behavior>> = {};
