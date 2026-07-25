/**
 * Battle BGM + SFX via Web Audio API (procedural — no SE rips).
 */

export class AudioDirector {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.bgmPlaying = false;
    this.muted = false;
    this._bgmNodes = [];
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopBgm();
    return this.muted;
  }

  /**
   * Epic-ish looping pseudo-orchestral battle drone + ostinato.
   */
  startBgm() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this._bgmNodes = [];

    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);

    // Low pad
    const pad = ctx.createOscillator();
    pad.type = 'sawtooth';
    pad.frequency.value = 55;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.35;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 400;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);
    pad.start();

    // Fifth
    const fifth = ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.value = 82.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.2;
    fifth.connect(g2);
    g2.connect(master);
    fifth.start();

    // Ostinato pulse
    const beat = ctx.createOscillator();
    beat.type = 'square';
    beat.frequency.value = 110;
    const beatGain = ctx.createGain();
    beatGain.gain.value = 0;
    beat.connect(beatGain);
    beatGain.connect(master);
    beat.start();

    const start = ctx.currentTime;
    for (let i = 0; i < 64; i++) {
      const t = start + i * 0.35;
      beatGain.gain.setValueAtTime(0, t);
      beatGain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      beatGain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      // melodic steps
      const notes = [110, 130.81, 146.83, 164.81, 146.83, 130.81, 123.47, 110];
      beat.frequency.setValueAtTime(notes[i % notes.length], t);
    }

    // Loop restart
    this._bgmTimer = setInterval(() => {
      if (!this.bgmPlaying || !this.ctx) return;
      // keep context alive; re-schedule pulse quietly
    }, 20000);

    this._bgmNodes = [pad, fifth, beat, master];
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this._bgmTimer) clearInterval(this._bgmTimer);
    for (const n of this._bgmNodes) {
      try {
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this._bgmNodes = [];
  }

  /**
   * Short UI/combat blip.
   * @param {'select'|'move'|'attack'|'magic'|'hit'|'victory'|'ui'} kind
   */
  sfx(kind) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    const now = ctx.currentTime;
    const map = {
      select: [440, 0.05, 'sine'],
      move: [220, 0.08, 'triangle'],
      attack: [180, 0.12, 'sawtooth'],
      magic: [520, 0.2, 'sine'],
      hit: [90, 0.1, 'square'],
      victory: [523.25, 0.4, 'triangle'],
      ui: [330, 0.04, 'sine'],
    };
    const [freq, dur, type] = map[kind] || map.ui;
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    if (kind === 'victory') {
      o.frequency.linearRampToValueAtTime(784, now + 0.3);
    }
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.15, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.02);
  }
}

export const audio = new AudioDirector();
