export interface MaterialDef {
  name: string;
  desc: string;
}

export const MATERIALS: Record<string, MaterialDef> = {
  bone_shard: { name: '부서진 뼛조각', desc: '좀비에게서 얻는 흔한 재료. 모든 강화에 쓰인다.' },
  mana_crystal: { name: '마력 결정', desc: '마법사가 지니고 다니는 결정. 스태프 강화에 쓰인다.' },
  wing_membrane: { name: '박쥐 날개막', desc: '미니언의 날개 조각. 무기 교환에 쓰인다.' },
  golem_core: { name: '골렘 핵 조각', desc: '골렘의 동력원 파편. 근접 무기 강화에 쓰인다.' },
  elite_sigil: { name: '정예의 증표', desc: '정예 몬스터만 떨어뜨리는 증표. +5 이상 강화에 필요하다.' },
  lord_heart: { name: '군주의 심장석', desc: '보스가 남기는 심장석. 강력한 무기 교환에 쓰인다.' },
  angel_feather: { name: '타락천사의 깃털', desc: '대성당의 망령과 타락천사가 떨어뜨린다. 영웅 무기 교환에 쓰인다.' },
  abyss_shard: { name: '심연의 파편', desc: '마왕성의 몬스터와 심연의 군주가 떨어뜨린다. 전설 무기 교환에 쓰인다.' },
  // 군단장 조각: 전투 기지의 조각 상인에게서 세트 방어구를 사고 강화한다.
  silence_shard: { name: '침묵의 조각', desc: '침묵의 기사단장이 남긴 조각. 근접 세트 방어구를 사고 강화한다.' },
  corrupt_shard: { name: '타락의 조각', desc: '타락한 엘프가 남긴 조각. 사격 세트 방어구를 사고 강화한다.' },
  dark_shard: { name: '암흑의 조각', desc: '암흑의 군주가 남긴 조각. 마법 세트 방어구를 사고 강화한다.' },
  hope_shard: { name: '희망의 조각', desc: '하드 군단장에게서 드물게 나오는 빛나는 조각. 전설 세트 방어구에 필요하다.' },
};
