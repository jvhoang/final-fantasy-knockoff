/**
 * Battle BGM + SFX via Web Audio API (procedural — no SE rips).
 * Melodic battle theme re-schedules forever while BGM is on (not a one-shot intro).
 */

/** Seconds of melody scheduled per loop arm */
export const BGM_PHRASE_SEC = 8.4;

/** How often we re-arm the next melodic phrase while playing (≤ half phrase) */
export const BGM_RESCHEDULE_MS = 2500;

/** Minor-mode battle ostinato (Hz) — heroic 8-bar feel */
export const BGM_MELODY_HZ = [
  220.0, 246.94, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94,
  196.0, 220.0, 246.94, 261.63, 293.66, 261.63, 246.94, 220.0,
  174.61, 196.0, 220.0, 246.94, 261.63, 246.94, 220.0, 196.0,
];

/** Harmony thirds for a fuller arrangement */
export const BGM_HARMONY_HZ = [
  329.63, 369.99, 392.0, 440.0, 493.88, 440.0, 392.0, 369.99,
  293.66, 329.63, 369.99, 392.0, 440.0, 392.0, 369.99, 329.63,
  261.63, 293.66, 329.63, 369.99, 392.0, 369.99, 329.63, 293.66,
];

/**
 * Pure schedule plan: list of note events for one phrase starting at t0.
 * Used by AudioDirector and unit tests (no AudioContext required).
 * @param {number} t0 start time (seconds)
 * @param {number} [step=0.35]
 * @returns {{ t: number, freq: number, harm: number, dur: number }[]}
 */
export function buildBgmPhraseSchedule(t0, step = 0.35) {
  const events = [];
  const n = BGM_MELODY_HZ.length;
  for (let i = 0; i < n; i++) {
    events.push({
      t: t0 + i * step,
      freq: BGM_MELODY_HZ[i % n],
      harm: BGM_HARMONY_HZ[i % BGM_HARMONY_HZ.length],
      dur: step * 0.85,
    });
  }
  return events;
}

/**
 * How many phrase arms cover `durationSec` of continuous play.
 * @param {number} durationSec
 * @param {number} [phraseSec=BGM_PHRASE_SEC]
 * @param {number} [rescheduleSec=BGM_RESCHEDULE_MS/1000]
 */
export function bgmArmsNeededForDuration(durationSec, phraseSec = BGM_PHRASE_SEC, rescheduleSec = BGM_RESCHEDULE_MS / 1000) {
  if (durationSec <= 0) return 0;
  // First arm covers phraseSec; subsequent arms every rescheduleSec
  if (durationSec <= phraseSec) return 1;
  return 1 + Math.ceil((durationSec - phraseSec) / rescheduleSec);
}

/**
 * Multi-minute coverage requires many re-arms (not a finite one-shot list).
 * @param {number} [minutes=5]
 */
export function bgmLoopCoversMinutes(minutes = 5) {
  const arms = bgmArmsNeededForDuration(minutes * 60);
  return { minutes, arms, phraseSec: BGM_PHRASE_SEC, rescheduleMs: BGM_RESCHEDULE_MS, ok: arms >= 20 };
}

/**
 * Pure re-arm planner used by AudioDirector._onBgmTick (and tests).
 * Always keep ≥1 full phrase scheduled ahead of `now` so melody never dies into pad-only silence.
 *
 * `nextPhraseAt` = audio time when the next unscheduled phrase must start
 * (= end of last armed phrase coverage).
 *
 * @param {number} now current AudioContext time (seconds)
 * @param {number} nextPhraseAt end of currently scheduled melody / start of next needed phrase
 * @param {number} [phraseSec=BGM_PHRASE_SEC]
 * @returns {{ starts: number[], nextPhraseAt: number }}
 */
export function planBgmRearm(now, nextPhraseAt, phraseSec = BGM_PHRASE_SEC) {
  const starts = [];
  let next = Number(nextPhraseAt) || 0;
  // Keep horizon at least one full phrase past now
  const minHorizon = now + phraseSec;
  let guard = 0;
  while (next < minHorizon && guard++ < 64) {
    // Prefer seamless chain at `next`; only snap forward if we somehow fell behind
    const t0 = next > now ? next : now + 0.02;
    starts.push(t0);
    next = t0 + phraseSec;
  }
  return { starts, nextPhraseAt: next };
}

/**
 * Simulate shipped tick loop over wall-clock audio time (no AudioContext).
 * Mirrors startBgm initial arm + periodic _onBgmTick using planBgmRearm.
 *
 * @param {number} durationSec total play length to cover
 * @param {{ tickSec?: number, phraseSec?: number, t0?: number }} [opts]
 * @returns {{ starts: number[], gaps: number[], maxGap: number, phraseCount: number }}
 */
export function simulateBgmLoop(durationSec, opts = {}) {
  const tickSec = opts.tickSec ?? BGM_RESCHEDULE_MS / 1000;
  const phraseSec = opts.phraseSec ?? BGM_PHRASE_SEC;
  const t0 = opts.t0 ?? 0.05;

  /** @type {number[]} */
  const starts = [t0];
  let nextPhraseAt = t0 + phraseSec;

  // Tick at intervals (and always once at/after durationSec)
  for (let now = tickSec; ; now += tickSec) {
    const t = Math.min(now, durationSec);
    const plan = planBgmRearm(t, nextPhraseAt, phraseSec);
    for (const s of plan.starts) starts.push(s);
    nextPhraseAt = plan.nextPhraseAt;
    if (now >= durationSec) break;
  }

  // Gaps between consecutive phrase coverage: end_i = starts[i]+phraseSec vs starts[i+1]
  const gaps = [];
  for (let i = 0; i < starts.length - 1; i++) {
    const end = starts[i] + phraseSec;
    gaps.push(starts[i + 1] - end);
  }
  const maxGap = gaps.length ? Math.max(...gaps) : 0;
  return { starts, gaps, maxGap, phraseCount: starts.length, nextPhraseAt, phraseSec, tickSec };
}

export class AudioDirector {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.bgmPlaying = false;
    this.muted = false;
    this._bgmNodes = [];
    this._bgmMaster = null;
    this._melodyOsc = null;
    this._melodyGain = null;
    this._harmonyOsc = null;
    this._harmonyGain = null;
    this._bgmTimer = null;
    this._phraseCount = 0;
    this._nextPhraseAt = 0;
  }

  ensure() {
    if (!this.ctx) {
      const g = typeof globalThis !== 'undefined' ? globalThis : null;
      const AC = g?.AudioContext || g?.webkitAudioContext || (typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null);
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      try {
        this.ctx.resume();
      } catch {
        /* ignore headless */
      }
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted) this.stopBgm();
    return this.muted;
  }

  /**
   * Looping melodic battle theme: pad + continuous re-armed ostinato.
   */
  startBgm() {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || this.bgmPlaying) return;
    this.bgmPlaying = true;
    this._bgmNodes = [];
    this._phraseCount = 0;

    const master = ctx.createGain();
    master.gain.value = 0.1;
    master.connect(ctx.destination);
    this._bgmMaster = master;

    // Warm low pad
    const pad = ctx.createOscillator();
    pad.type = 'sawtooth';
    pad.frequency.value = 55;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 320;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.22;
    pad.connect(padFilter);
    padFilter.connect(padGain);
    padGain.connect(master);
    pad.start();

    // Sustained fifth
    const fifth = ctx.createOscillator();
    fifth.type = 'triangle';
    fifth.frequency.value = 82.5;
    const g2 = ctx.createGain();
    g2.gain.value = 0.12;
    fifth.connect(g2);
    g2.connect(master);
    fifth.start();

    // Octave bass pulse
    const bass = ctx.createOscillator();
    bass.type = 'triangle';
    bass.frequency.value = 110;
    const bassGain = ctx.createGain();
    bassGain.gain.value = 0.1;
    bass.connect(bassGain);
    bassGain.connect(master);
    bass.start();

    // Lead melody (re-scheduled forever)
    const melody = ctx.createOscillator();
    melody.type = 'square';
    melody.frequency.value = BGM_MELODY_HZ[0];
    const mFilter = ctx.createBiquadFilter();
    mFilter.type = 'lowpass';
    mFilter.frequency.value = 1800;
    const mGain = ctx.createGain();
    mGain.gain.value = 0.0001;
    melody.connect(mFilter);
    mFilter.connect(mGain);
    mGain.connect(master);
    melody.start();

    // Harmony voice
    const harm = ctx.createOscillator();
    harm.type = 'triangle';
    harm.frequency.value = BGM_HARMONY_HZ[0];
    const hGain = ctx.createGain();
    hGain.gain.value = 0.0001;
    harm.connect(hGain);
    hGain.connect(master);
    harm.start();

    this._melodyOsc = melody;
    this._melodyGain = mGain;
    this._harmonyOsc = harm;
    this._harmonyGain = hGain;
    this._bgmNodes = [pad, fifth, bass, melody, harm, master];

    // Arm first phrase + keep re-arming
    this._scheduleMelodyPhrase(ctx.currentTime + 0.05);
    if (this._bgmTimer) clearInterval(this._bgmTimer);
    this._bgmTimer = setInterval(() => this._onBgmTick(), BGM_RESCHEDULE_MS);
  }

  /**
   * Re-arm melody via pure planBgmRearm — always keep ≥1 phrase scheduled ahead.
   * Safe to call from interval while bgmPlaying.
   */
  _onBgmTick() {
    if (!this.bgmPlaying || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const plan = planBgmRearm(now, this._nextPhraseAt, BGM_PHRASE_SEC);
    for (const t0 of plan.starts) {
      this._scheduleMelodyPhrase(t0);
    }
    // plan already advances nextPhraseAt; keep in sync if no new arms
    if (plan.starts.length === 0) {
      this._nextPhraseAt = plan.nextPhraseAt;
    }
  }

  /**
   * Schedule one melodic phrase onto live oscillators.
   * @param {number} t0
   */
  _scheduleMelodyPhrase(t0) {
    if (!this.ctx || !this._melodyOsc || !this._melodyGain) return;
    const schedule = buildBgmPhraseSchedule(t0, 0.35);
    for (const ev of schedule) {
      this._melodyOsc.frequency.setValueAtTime(ev.freq, ev.t);
      this._harmonyOsc.frequency.setValueAtTime(ev.harm, ev.t);
      this._melodyGain.gain.setValueAtTime(0.0001, ev.t);
      this._melodyGain.gain.linearRampToValueAtTime(0.11, ev.t + 0.02);
      this._melodyGain.gain.exponentialRampToValueAtTime(0.0001, ev.t + ev.dur);
      this._harmonyGain.gain.setValueAtTime(0.0001, ev.t);
      this._harmonyGain.gain.linearRampToValueAtTime(0.055, ev.t + 0.03);
      this._harmonyGain.gain.exponentialRampToValueAtTime(0.0001, ev.t + ev.dur);
    }
    this._phraseCount += 1;
    this._nextPhraseAt = t0 + BGM_PHRASE_SEC;
  }

  /** @returns {{ playing: boolean, phraseCount: number, rescheduleMs: number }} */
  getBgmStatus() {
    return {
      playing: this.bgmPlaying,
      phraseCount: this._phraseCount,
      rescheduleMs: BGM_RESCHEDULE_MS,
      phraseSec: BGM_PHRASE_SEC,
    };
  }

  stopBgm() {
    this.bgmPlaying = false;
    if (this._bgmTimer) {
      clearInterval(this._bgmTimer);
      this._bgmTimer = null;
    }
    for (const n of this._bgmNodes) {
      try {
        if (n.stop) n.stop();
        if (n.disconnect) n.disconnect();
      } catch {
        /* ignore */
      }
    }
    this._bgmNodes = [];
    this._melodyOsc = null;
    this._melodyGain = null;
    this._harmonyOsc = null;
    this._harmonyGain = null;
    this._bgmMaster = null;
    this._phraseCount = 0;
  }

  /**
   * Distinct combat / UI SFX families.
   * @param {'select'|'move'|'melee'|'bow'|'attack'|'magic'|'hit'|'victory'|'ui'|'summon'|'cast'} kind
   * @param {{ intensity?: number }} [opts]
   */
  sfx(kind, opts = {}) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx) return;
    const intensity = Math.max(0.4, Math.min(2.5, opts.intensity ?? 1));
    const now = ctx.currentTime;

    // Normalize aliases
    let k = kind;
    if (k === 'attack') k = 'melee';
    if (k === 'cast') k = 'magic';

    if (k === 'move') {
      this._blip(ctx, now, { freq: 180, end: 140, dur: 0.09, type: 'triangle', gain: 0.1 });
      this._blip(ctx, now + 0.07, { freq: 160, end: 120, dur: 0.08, type: 'triangle', gain: 0.07 });
      return;
    }
    if (k === 'melee') {
      // Whoosh + metallic strike
      this._noiseBurst(ctx, now, 0.08, 0.12 * intensity, 800);
      this._blip(ctx, now + 0.04, { freq: 220, end: 90, dur: 0.14, type: 'sawtooth', gain: 0.16 * intensity });
      this._blip(ctx, now + 0.06, { freq: 440, end: 180, dur: 0.08, type: 'square', gain: 0.08 * intensity });
      return;
    }
    if (k === 'bow') {
      // String twang + air
      this._blip(ctx, now, { freq: 520, end: 380, dur: 0.12, type: 'triangle', gain: 0.12 });
      this._noiseBurst(ctx, now + 0.02, 0.12, 0.06, 2000);
      this._blip(ctx, now + 0.15, { freq: 200, end: 100, dur: 0.1, type: 'sine', gain: 0.08 });
      return;
    }
    if (k === 'magic' || k === 'summon') {
      const big = k === 'summon' || intensity > 1.4;
      this._blip(ctx, now, { freq: 330, end: 660, dur: 0.25 * intensity, type: 'sine', gain: 0.1 * intensity });
      this._blip(ctx, now + 0.05, { freq: 440, end: 880, dur: 0.3 * intensity, type: 'triangle', gain: 0.08 * intensity });
      if (big) {
        this._blip(ctx, now + 0.12, { freq: 110, end: 55, dur: 0.45, type: 'sawtooth', gain: 0.1 * intensity });
        this._noiseBurst(ctx, now + 0.1, 0.35, 0.08 * intensity, 600);
      }
      return;
    }
    if (k === 'hit') {
      this._noiseBurst(ctx, now, 0.06, 0.14 * intensity, 400);
      this._blip(ctx, now, { freq: 120, end: 60, dur: 0.12, type: 'square', gain: 0.14 * intensity });
      return;
    }
    if (k === 'victory') {
      this._blip(ctx, now, { freq: 523.25, end: 784, dur: 0.45, type: 'triangle', gain: 0.14 });
      this._blip(ctx, now + 0.2, { freq: 659.25, end: 1046.5, dur: 0.4, type: 'sine', gain: 0.1 });
      return;
    }
    if (k === 'select') {
      this._blip(ctx, now, { freq: 520, end: 620, dur: 0.05, type: 'sine', gain: 0.08 });
      return;
    }
    // ui default
    this._blip(ctx, now, { freq: 330, end: 300, dur: 0.04, type: 'sine', gain: 0.07 });
  }

  _blip(ctx, t, { freq, end, dur, type, gain }) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, end), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, gain), t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noiseBurst(ctx, t, dur, gain, cutoff) {
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export const audio = new AudioDirector();
