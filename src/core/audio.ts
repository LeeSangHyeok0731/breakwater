// 효과음: 음원 파일 없이 Web Audio로 합성한다.
// 브라우저 정책상 첫 사용자 입력 뒤에 unlock() 해야 소리가 난다.

export type SfxName =
  | 'slash'
  | 'hit'
  | 'crit'
  | 'shot'
  | 'arrow'
  | 'magic'
  | 'boom'
  | 'hurt'
  | 'block'
  | 'parry'
  | 'dodge'
  | 'kill'
  | 'reload'
  | 'wave'
  | 'clear'
  | 'fail'
  | 'potion';

/** 같은 소리가 너무 촘촘하게 겹치지 않도록 하는 최소 간격 (초) */
const MIN_GAP: Partial<Record<SfxName, number>> = { hit: 0.035, crit: 0.05, kill: 0.04, slash: 0.05, magic: 0.04 };

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<SfxName, number>();
  private volume = 0.6;

  unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  play(name: SfxName, gain = 1): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.volume <= 0) return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[name] ?? 0.02;
    if (now - (this.last.get(name) ?? -1) < gap) return;
    this.last.set(name, now);

    switch (name) {
      case 'slash':
        this.noiseHit(now, 0.14, 'bandpass', 2600, 900, 0.5 * gain);
        break;
      case 'hit':
        this.noiseHit(now, 0.07, 'lowpass', 1400, 500, 0.45 * gain);
        this.tone(now, 'sine', 170, 90, 0.08, 0.35 * gain);
        break;
      case 'crit':
        this.noiseHit(now, 0.09, 'lowpass', 2000, 600, 0.5 * gain);
        this.tone(now, 'triangle', 1300, 1100, 0.14, 0.18 * gain);
        this.tone(now, 'sine', 200, 80, 0.1, 0.4 * gain);
        break;
      case 'shot':
        this.noiseHit(now, 0.12, 'highpass', 900, 400, 0.55 * gain);
        this.tone(now, 'square', 140, 50, 0.1, 0.25 * gain);
        break;
      case 'arrow':
        this.noiseHit(now, 0.1, 'bandpass', 3800, 1800, 0.35 * gain);
        break;
      case 'magic':
        this.tone(now, 'triangle', 520, 980, 0.14, 0.22 * gain);
        this.tone(now, 'sine', 1040, 1560, 0.1, 0.08 * gain);
        break;
      case 'boom':
        this.noiseHit(now, 0.6, 'lowpass', 700, 120, 0.8 * gain);
        this.tone(now, 'sine', 90, 35, 0.5, 0.6 * gain);
        break;
      case 'hurt':
        this.tone(now, 'square', 260, 110, 0.16, 0.22 * gain);
        this.noiseHit(now, 0.08, 'lowpass', 900, 300, 0.3 * gain);
        break;
      case 'block':
        this.tone(now, 'square', 700, 500, 0.06, 0.15 * gain);
        this.noiseHit(now, 0.06, 'highpass', 2500, 1500, 0.3 * gain);
        break;
      case 'parry':
        this.tone(now, 'sine', 1500, 1480, 0.35, 0.2 * gain);
        this.tone(now, 'sine', 2250, 2200, 0.3, 0.12 * gain);
        this.noiseHit(now, 0.05, 'highpass', 4000, 3000, 0.3 * gain);
        break;
      case 'dodge':
        this.noiseHit(now, 0.2, 'bandpass', 900, 2200, 0.3 * gain);
        break;
      case 'kill':
        this.tone(now, 'triangle', 340, 140, 0.16, 0.2 * gain);
        break;
      case 'reload':
        this.tone(now, 'square', 1800, 1800, 0.025, 0.12 * gain);
        this.tone(now + 0.18, 'square', 1400, 1400, 0.03, 0.12 * gain);
        break;
      case 'potion':
        this.tone(now, 'sine', 660, 990, 0.12, 0.2 * gain);
        this.tone(now + 0.08, 'sine', 880, 1320, 0.14, 0.15 * gain);
        break;
      case 'wave':
        this.arp(now, [392, 523, 659], 0.09, 'triangle', 0.18 * gain);
        break;
      case 'clear':
        this.arp(now, [523, 659, 784, 1047], 0.11, 'triangle', 0.22 * gain);
        break;
      case 'fail':
        this.arp(now, [392, 330, 262, 196], 0.16, 'sine', 0.22 * gain);
        break;
    }
  }

  private envelope(start: number, dur: number, peak: number): GainNode {
    const g = this.ctx!.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.01, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    g.connect(this.master!);
    return g;
  }

  private tone(start: number, type: OscillatorType, from: number, to: number, dur: number, peak: number): void {
    const osc = this.ctx!.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    osc.connect(this.envelope(start, dur, peak));
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private noiseHit(start: number, dur: number, type: BiquadFilterType, from: number, to: number, peak: number): void {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = this.ctx!.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), start + dur);
    src.connect(filter);
    filter.connect(this.envelope(start, dur, peak));
    src.start(start, Math.random() * 0.5);
    src.stop(start + dur + 0.02);
  }

  private arp(start: number, notes: number[], step: number, type: OscillatorType, peak: number): void {
    notes.forEach((f, i) => this.tone(start + i * step, type, f, f, step * 1.8, peak));
  }
}

export const sfx = new Sfx();
