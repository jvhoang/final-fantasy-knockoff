/**
 * Battle BGM + SFX via Web Audio API (procedural — no SE rips).
 * Melodic battle theme re-schedules forever while BGM is on (not a one-shot intro).
 */

/** Seconds of melody scheduled per loop arm (longer multi-section epic piece) */
export const BGM_PHRASE_SEC = 28.0;

/** How often we re-arm the next melodic phrase while playing (≤ half phrase) */
export const BGM_RESCHEDULE_MS = 4000;

/** Note step within a phrase */
export const BGM_NOTE_STEP = 0.28;

/**
 * Multi-section battle themes (Hz). Longer before loop; phase picks variation.
 * early = heroic minor, mid = rising tension, late = dramatic intensity
 */
export const BGM_THEMES = {
  early: {
    melody: [
      220, 246.94, 261.63, 293.66, 329.63, 293.66, 261.63, 246.94,
      196, 220, 246.94, 261.63, 293.66, 261.63, 246.94, 220,
      174.61, 196, 220, 246.94, 261.63, 246.94, 220, 196,
      246.94, 261.63, 293.66, 329.63, 392, 329.63, 293.66, 261.63,
      220, 196, 174.61, 196, 220, 246.94, 261.63, 220,
      293.66, 329.63, 349.23, 392, 440, 392, 349.23, 329.63,
      261.63, 293.66, 329.63, 261.63, 220, 246.94, 261.63, 220,
      196, 220, 246.94, 196, 174.61, 196, 220, 196,
      220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63,
      293.66, 246.94, 220, 196, 220, 246.94, 261.63, 220,
      174.61, 196, 220, 261.63, 293.66, 261.63, 220, 196,
      246.94, 293.66, 349.23, 392, 349.23, 293.66, 246.94, 220,
      196, 220, 261.63, 329.63, 261.63, 220, 196, 174.61,
    ],
    harmony: null, // derived
  },
  mid: {
    melody: [
      246.94, 277.18, 293.66, 329.63, 369.99, 329.63, 293.66, 277.18,
      220, 246.94, 277.18, 293.66, 329.63, 293.66, 277.18, 246.94,
      196, 220, 246.94, 277.18, 293.66, 277.18, 246.94, 220,
      277.18, 293.66, 329.63, 369.99, 440, 369.99, 329.63, 293.66,
      246.94, 220, 196, 220, 246.94, 277.18, 293.66, 246.94,
      329.63, 369.99, 392, 440, 493.88, 440, 392, 369.99,
      293.66, 329.63, 369.99, 293.66, 246.94, 277.18, 293.66, 246.94,
      220, 246.94, 277.18, 220, 196, 220, 246.94, 220,
      277.18, 329.63, 392, 440, 523.25, 440, 392, 329.63,
      369.99, 293.66, 246.94, 220, 246.94, 277.18, 293.66, 246.94,
      196, 220, 246.94, 293.66, 329.63, 293.66, 246.94, 220,
      277.18, 329.63, 392, 440, 392, 329.63, 277.18, 246.94,
      220, 246.94, 293.66, 369.99, 293.66, 246.94, 220, 196,
    ],
  },
  late: {
    melody: [
      293.66, 329.63, 349.23, 392, 466.16, 392, 349.23, 329.63,
      246.94, 293.66, 329.63, 349.23, 392, 349.23, 329.63, 293.66,
      220, 246.94, 293.66, 329.63, 349.23, 329.63, 293.66, 246.94,
      329.63, 349.23, 392, 440, 523.25, 440, 392, 349.23,
      293.66, 246.94, 220, 246.94, 293.66, 329.63, 349.23, 293.66,
      392, 440, 466.16, 523.25, 587.33, 523.25, 466.16, 440,
      349.23, 392, 440, 349.23, 293.66, 329.63, 349.23, 293.66,
      246.94, 293.66, 329.63, 246.94, 220, 246.94, 293.66, 246.94,
      329.63, 392, 466.16, 523.25, 622.25, 523.25, 466.16, 392,
      440, 349.23, 293.66, 246.94, 293.66, 329.63, 349.23, 293.66,
      220, 246.94, 293.66, 349.23, 392, 349.23, 293.66, 246.94,
      329.63, 392, 466.16, 523.25, 466.16, 392, 329.63, 293.66,
      246.94, 293.66, 349.23, 440, 349.23, 293.66, 246.94, 220,
    ],
  },
};

/** Default / early melody alias for tests */
export const BGM_MELODY_HZ = BGM_THEMES.early.melody;

/** Harmony derived a fifth above when not listed */
export function harmonyFor(freq) {
  return freq * 1.5;
}

export const BGM_HARMONY_HZ = BGM_MELODY_HZ.map(harmonyFor);

/**
 * Battle progress 0..1 from living units (fewer living → later phase).
 * @param {{ units?: { alive?: boolean, team?: string }[] }|null} state
 * @returns {{ progress: number, phase: 'early'|'mid'|'late', intensity: number }}
 */
export function bgmPhaseFromBattle(state) {
  const units = state?.units || [];
  const living = units.filter((u) => u.alive !== false);
  const livingEnemies = living.filter((u) => u.team === 'enemy');
  const totalEnemies = units.filter((u) => u.team === 'enemy').length || 4;
  // 0 when all foes alive, ~1 when none left (clamp)
  const foesDown = 1 - livingEnemies.length / Math.max(1, totalEnemies);
  // Also weight total casualties
  const total = units.length || 8;
  const deadRatio = 1 - living.length / total;
  const progress = Math.min(1, Math.max(0, foesDown * 0.7 + deadRatio * 0.3));
  let phase = 'early';
  if (progress >= 0.62) phase = 'late';
  else if (progress >= 0.32) phase = 'mid';
  const intensity = phase === 'late' ? 1.55 : phase === 'mid' ? 1.2 : 1.0;
  return { progress, phase, intensity, livingEnemies: livingEnemies.length, totalEnemies };
}

/**
 * Pure schedule plan: list of note events for one phrase starting at t0.
 * @param {number} t0 start time (seconds)
 * @param {number} [step=BGM_NOTE_STEP]
 * @param {'early'|'mid'|'late'} [phase='early']
 * @returns {{ t: number, freq: number, harm: number, dur: number }[]}
 */
export function buildBgmPhraseSchedule(t0, step = BGM_NOTE_STEP, phase = 'early') {
  const theme = BGM_THEMES[phase] || BGM_THEMES.early;
  const melody = theme.melody;
  const events = [];
  // Cap notes to fit BGM_PHRASE_SEC
  const maxNotes = Math.min(melody.length, Math.floor(BGM_PHRASE_SEC / step));
  for (let i = 0; i < maxNotes; i++) {
    const freq = melody[i % melody.length];
    events.push({
      t: t0 + i * step,
      freq,
      harm: harmonyFor(freq),
      dur: step * 0.82,
      phase,
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

/** Phrase duration must stay long enough for multi-section epic feel */
export function bgmPhraseIsLongForm(phraseSec = BGM_PHRASE_SEC) {
  return phraseSec >= 20;
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
    /** @type {'early'|'mid'|'late'} */
    this._bgmPhase = 'early';
    this._bgmIntensity = 1;
    this._padGain = null;
    this._bassGain = null;
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
    this._bgmPhase = 'early';
    this._bgmIntensity = 1;

    const master = ctx.createGain();
    master.gain.value = 0.11;
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
    this._padGain = padGain;

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
    this._bassGain = bassGain;

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
    const schedule = buildBgmPhraseSchedule(t0, BGM_NOTE_STEP, this._bgmPhase);
    const lead = 0.1 * this._bgmIntensity;
    const harmG = 0.05 * this._bgmIntensity;
    for (const ev of schedule) {
      this._melodyOsc.frequency.setValueAtTime(ev.freq, ev.t);
      this._harmonyOsc.frequency.setValueAtTime(ev.harm, ev.t);
      this._melodyGain.gain.setValueAtTime(0.0001, ev.t);
      this._melodyGain.gain.linearRampToValueAtTime(lead, ev.t + 0.02);
      this._melodyGain.gain.exponentialRampToValueAtTime(0.0001, ev.t + ev.dur);
      this._harmonyGain.gain.setValueAtTime(0.0001, ev.t);
      this._harmonyGain.gain.linearRampToValueAtTime(harmG, ev.t + 0.03);
      this._harmonyGain.gain.exponentialRampToValueAtTime(0.0001, ev.t + ev.dur);
    }
    this._phraseCount += 1;
    this._nextPhraseAt = t0 + BGM_PHRASE_SEC;
  }

  /**
   * Shift BGM toward mid/late intensity as the fight progresses.
   * @param {{ units?: object[] }|null} state
   */
  setBattleProgress(state) {
    const info = bgmPhaseFromBattle(state);
    const prev = this._bgmPhase;
    this._bgmPhase = info.phase;
    this._bgmIntensity = info.intensity;
    if (this._padGain) {
      this._padGain.gain.value = info.phase === 'late' ? 0.3 : info.phase === 'mid' ? 0.25 : 0.22;
    }
    if (this._bassGain) {
      this._bassGain.gain.value = info.phase === 'late' ? 0.16 : 0.1;
    }
    if (this._bgmMaster) {
      this._bgmMaster.gain.value = info.phase === 'late' ? 0.14 : 0.11;
    }
    // Force re-arm soon when phase changes so new theme starts
    if (this.bgmPlaying && prev !== info.phase && this.ctx) {
      this._nextPhraseAt = Math.min(this._nextPhraseAt, this.ctx.currentTime + 0.15);
      this._onBgmTick();
    }
    return info;
  }

  /** @returns {{ playing: boolean, phraseCount: number, rescheduleMs: number, phase: string, intensity: number }} */
  getBgmStatus() {
    return {
      playing: this.bgmPlaying,
      phraseCount: this._phraseCount,
      rescheduleMs: BGM_RESCHEDULE_MS,
      phraseSec: BGM_PHRASE_SEC,
      phase: this._bgmPhase,
      intensity: this._bgmIntensity,
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
