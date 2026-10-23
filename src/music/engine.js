import * as Tone from 'tone'
import {
  NOTE_NAMES,
  PROGRESSIONS,
  bassNote,
  buildChord,
  chance,
  fitToChord,
  makeMotif,
  pick,
  rand,
  trackName,
  varyMotif,
  voiceChord,
} from './theory.js'
import { createTextures } from './textures.js'

const PIANO_SAMPLES = Object.fromEntries(
  ['A1', 'C2', 'D#2', 'F#2', 'A2', 'C3', 'D#3', 'F#3', 'A3', 'C4', 'D#4', 'F#4', 'A4', 'C5', 'D#5', 'F#5', 'A5', 'C6'].map(
    (n) => [n, n.replace('#', 's') + '.mp3'],
  ),
)

const MOODS = {
  lofi: { bpm: [68, 80], brightness: 3800, voices: ['koto', 'koto', 'piano', 'flute'] },
  ambient: { bpm: [52, 62], brightness: 2600, voices: ['flute', 'flute', 'koto', 'piano'] },
}

// Comping rhythms for the keys, as [step, duration] in 16ths.
const KEYS_PATTERNS = [
  [[0, 15]],
  [[0, 6], [10, 6]],
  [[0, 6], [6, 10]],
  [[0, 9], [14, 2]],
]

// Bass: [step, duration, interval above root].
const BASS_PATTERNS = [
  [[0, 8, 0], [10, 5, 0]],
  [[0, 6, 0], [6, 2, 7], [8, 7, 0]],
  [[0, 14, 0]],
  [[0, 5, 0], [7, 3, 12], [10, 5, 0]],
]

// Kick probabilities per 16th step (boom-bap variations).
const KICK_PATTERNS = [
  { 0: 1, 7: 0.25, 10: 0.9 },
  { 0: 1, 3: 0.3, 8: 0.6, 10: 0.5 },
  { 0: 1, 6: 0.3, 9: 0.85 },
]

function lofiSections() {
  return [
    { name: 'Intro', bars: 4, keys: true },
    { name: 'Groove', bars: 8, keys: true, bass: true, drums: 'full' },
    { name: 'Theme', bars: 8, keys: true, bass: true, drums: 'full', melody: 'A' },
    { name: 'Drift', bars: 8, keys: true, bass: true, drums: 'light', melody: chance(0.6) ? 'B' : null, prog: 1 },
    { name: 'Breakdown', bars: 4, keys: true, pad: true, melody: 'B', prog: 1 },
    { name: 'Theme', bars: 8, keys: true, bass: true, drums: 'full', melody: 'A' },
    { name: 'Outro', bars: 4, keys: true, bass: true, drums: 'light', fadeOut: true },
  ]
}

function ambientSections() {
  return [
    { name: 'Still', bars: 8, pad: true, sparse: true },
    { name: 'Breath', bars: 8, pad: true, sparse: true, bass: true, melody: 'A' },
    { name: 'Drift', bars: 8, pad: true, sparse: true, bass: true, melody: 'B', prog: 1 },
    { name: 'Still', bars: 4, pad: true, sparse: true },
    { name: 'Breath', bars: 8, pad: true, sparse: true, bass: true, melody: 'A', fadeOut: true },
  ]
}

const toNote = (midi) => Tone.Frequency(midi, 'midi').toNote()

class ZenEngine {
  state = {
    status: 'idle', // idle | loading | playing | paused | error
    mood: 'lofi',
    track: null,
    section: null,
    chord: null,
    levels: { music: 0.8, vinyl: 0.4, rain: 0.25, wind: 0, ocean: 0 },
  }

  listeners = new Set()
  subscribe = (fn) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getState = () => this.state

  // Beat events let visuals react to exactly what the music is playing.
  // They fire on the animation frame closest to when each sound is heard.
  beatListeners = new Set()
  onBeat = (fn) => {
    this.beatListeners.add(fn)
    return () => this.beatListeners.delete(fn)
  }
  beat(type, time, data = {}) {
    Tone.getDraw().schedule(() => this.beatListeners.forEach((fn) => fn(type, data)), time)
  }

  // UI state must never be dropped (Tone's Draw skips late frames), so use a timer.
  setAt(time, patch) {
    setTimeout(() => this.set(patch), Math.max(0, (time - Tone.now()) * 1000))
  }

  // Smoothed loudness of the music (0 to ~1), for continuous motion.
  getLevel = () => (this.state.status === 'playing' && this.meter ? Math.min(1, this.meter.getValue() * 4) : 0)
  set(patch) {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((fn) => fn())
  }

  async toggle() {
    const { status } = this.state
    if (status === 'loading') return
    if (status === 'playing') return this.pause()
    if (status === 'idle' || status === 'error') {
      this.set({ status: 'loading' })
      try {
        await this.init()
      } catch (err) {
        console.error(err)
        this.set({ status: 'error' })
        return
      }
    }
    this.resume()
  }

  // Start a fresh track at the next bar line (also used for mood changes).
  skip() {
    this.pendingTrack = true
    if (this.state.status === 'playing') this.musicBus.gain.rampTo(0, 0.8)
  }

  setMood(mood) {
    if (mood === this.state.mood) return
    this.set({ mood })
    if (this.track) this.skip()
  }

  setLevel(name, value) {
    this.set({ levels: { ...this.state.levels, [name]: value } })
    this.applyLevel(name)
  }

  applyLevel(name) {
    const level = this.levelNodes?.[name]
    if (level) level.gain.gain.rampTo(this.state.levels[name] ** 2 * level.scale, 0.15)
  }

  async init() {
    if (this.ready) return
    await Tone.start()
    const destination = Tone.getDestination()

    this.master = new Tone.Gain(0)
    this.master.chain(
      new Tone.Gain(Tone.dbToGain(7)),
      new Tone.Compressor({ threshold: -18, ratio: 3, attack: 0.02, release: 0.25 }),
      new Tone.Limiter(-1),
      destination,
    )

    // Everything musical runs through the "lofi" treatment: a darkening
    // filter and a slow tape-style pitch wobble.
    this.musicBus = new Tone.Gain(1)
    this.toneFilter = new Tone.Filter({ type: 'lowpass', frequency: 3800, rolloff: -12, Q: 0.4 })
    const musicLevel = new Tone.Gain(0)
    this.musicBus.chain(this.toneFilter, new Tone.Vibrato({ frequency: 0.45, depth: 0.06 }), musicLevel, this.master)
    this.meter = new Tone.Meter({ normalRange: true, smoothing: 0.85 })
    musicLevel.connect(this.meter)
    this.reverb = new Tone.Reverb({ decay: 6, preDelay: 0.03, wet: 1 })
    this.reverb.connect(this.musicBus)

    const route = (node, send) => {
      node.connect(this.musicBus)
      if (send > 0) node.connect(new Tone.Gain(send).connect(this.reverb))
      return node
    }

    // Keys: sampled grand piano, chorused and darkened to feel like an old record.
    this.piano = new Tone.Sampler({
      urls: PIANO_SAMPLES,
      baseUrl: `${import.meta.env.BASE_URL}samples/piano/`,
      release: 1.2,
      volume: 3,
    })
    const keysOut = new Tone.Filter(2200, 'lowpass')
    this.piano.chain(new Tone.Chorus({ frequency: 0.8, delayTime: 3.5, depth: 0.4, wet: 0.35 }).start(), keysOut)
    route(keysOut, 0.35)

    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 18 },
      envelope: { attack: 2.5, decay: 1, sustain: 0.8, release: 5 },
      volume: -13,
    })
    const padOut = new Tone.Filter(900, 'lowpass')
    this.pad.connect(padOut)
    route(padOut, 0.6)

    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      filter: { type: 'lowpass', rolloff: -24, Q: 1 },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 0.6 },
      filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.5, baseFrequency: 120, octaves: 2 },
      volume: -9,
    })
    route(this.bass, 0.05)

    // Koto-ish plucked string (Karplus-Strong) with a soft echo.
    this.koto = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 3800, resonance: 0.94, volume: -4 })
    const kotoEcho = new Tone.FeedbackDelay({ delayTime: '8n.', feedback: 0.25, wet: 0.2 })
    this.koto.connect(kotoEcho)
    route(kotoEcho, 0.45)

    // Shakuhachi-ish flute: soft triangle with vibrato plus a breath of noise.
    this.flute = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.18, decay: 0.2, sustain: 0.85, release: 1.2 },
      portamento: 0.05,
      volume: -12,
    })
    const fluteOut = new Tone.Filter(2600, 'lowpass')
    this.flute.chain(new Tone.Vibrato({ frequency: 5, depth: 0.08 }), fluteOut)
    route(fluteOut, 0.55)
    this.breath = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.12, decay: 0.3, sustain: 0.25, release: 0.8 },
      volume: -34,
    })
    const breathOut = new Tone.Filter({ type: 'bandpass', frequency: 1800, Q: 0.8 })
    this.breath.connect(breathOut)
    route(breathOut, 0.55)

    // Drums, all synthesized and kept soft.
    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.04,
      octaves: 5,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 },
      volume: -10,
    })
    route(this.kick, 0)
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.002, decay: 0.16, sustain: 0, release: 0.05 },
      volume: -14,
    })
    const snareOut = new Tone.Filter({ type: 'bandpass', frequency: 1700, Q: 0.7 })
    this.snare.connect(snareOut)
    route(snareOut, 0.2)
    this.snareBody = new Tone.MembraneSynth({
      pitchDecay: 0.01,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.05 },
      volume: -18,
    })
    route(this.snareBody, 0.1)
    this.hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.02 },
      volume: -24,
    })
    const hatOut = new Tone.Filter(7500, 'highpass')
    this.hat.connect(hatOut)
    route(hatOut, 0.08)

    // Temple-bell-like FM tone that rings in each new track.
    this.bell = new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 12,
      envelope: { attack: 0.001, decay: 4, sustain: 0, release: 4 },
      modulationEnvelope: { attack: 0.002, decay: 1.5, sustain: 0, release: 2 },
      volume: -24,
    })
    route(this.bell, 0.9)

    const textures = createTextures(this.master)
    this.sources = textures.sources
    this.levelNodes = { music: { gain: musicLevel, scale: 1 }, ...textures.levels }

    await Promise.all([Tone.loaded(), this.reverb.ready])

    this.transport = Tone.getTransport()
    this.transport.scheduleRepeat((time) => this.onBar(time), '1m')
    Object.keys(this.levelNodes).forEach((name) => this.applyLevel(name))
    this.ready = true
  }

  resume() {
    this.sources.forEach((s) => s.state !== 'started' && s.start())
    this.transport.start('+0.1')
    this.master.gain.rampTo(1, 1.5)
    this.set({ status: 'playing' })
  }

  pause() {
    this.set({ status: 'paused' })
    this.master.gain.rampTo(0, 0.5)
    clearTimeout(this.pauseTimer)
    this.pauseTimer = setTimeout(() => {
      if (this.state.status !== 'paused') return
      this.transport.pause()
      this.sources.forEach((s) => s.stop())
      this.piano.releaseAll()
      this.pad.releaseAll()
    }, 600)
  }

  newTrack(time) {
    const mood = this.state.mood
    const config = MOODS[mood]
    const keyPc = pick([2, 3, 5, 7, 8, 9, 10].filter((k) => k !== this.track?.keyPc))
    const progressions = [...PROGRESSIONS[mood]].sort(() => Math.random() - 0.5).slice(0, 2)

    this.track = {
      name: trackName(),
      mood,
      keyPc,
      keyName: NOTE_NAMES[keyPc],
      bpm: Math.round(rand(...config.bpm)),
      swing: rand(0.28, 0.42),
      progressions,
      barsPerChord: mood === 'ambient' || chance(0.25) ? 2 : 1,
      voices: { A: pick(config.voices), B: pick(config.voices) },
      motifs: {},
      keysPattern: pick(KEYS_PATTERNS),
      bassPattern: pick(BASS_PATTERNS),
      kickPattern: pick(KICK_PATTERNS),
      sections: mood === 'ambient' ? ambientSections() : lofiSections(),
    }
    this.sectionIndex = 0
    this.sectionBar = 0
    this.voicing = null
    this.pendingTrack = false

    const t = this.track
    this.transport.bpm.setValueAtTime(t.bpm, time)
    this.pad.releaseAll(time)
    this.musicBus.gain.cancelScheduledValues(time)
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.getValueAtTime(time), time)
    this.musicBus.gain.linearRampToValueAtTime(1, time + 1.5)
    this.toneFilter.frequency.cancelScheduledValues(time)
    this.toneFilter.frequency.setValueAtTime(700, time)
    this.toneFilter.frequency.exponentialRampToValueAtTime(config.brightness, time + 6)
    this.bell.triggerAttackRelease(toNote(60 + keyPc), 4, time, 0.6)
    this.beat('track', time)

    this.setAt(time, { track: { name: t.name, keyName: t.keyName, bpm: t.bpm, mood } })
  }

  onBar(time) {
    if (!this.track || this.pendingTrack || this.sectionIndex >= this.track.sections.length) this.newTrack(time)

    const track = this.track
    const section = track.sections[this.sectionIndex]
    const barDur = 240 / track.bpm
    const s16 = barDur / 16
    const progression = track.progressions[section.prog ?? 0]
    const chordIdx = Math.floor(this.sectionBar / track.barsPerChord) % progression.length
    const chord = buildChord(track.keyPc, progression[chordIdx])
    const chordStart = this.sectionBar % track.barsPerChord === 0

    // Swing pushes every off-beat 16th late; tiny jitter keeps it human.
    const at = (step) => time + step * s16 + (step % 2 === 1 ? track.swing * s16 : 0)
    const jitter = () => rand(-0.006, 0.006)

    if (this.sectionBar === 0 && section.fadeOut) this.musicBus.gain.rampTo(0.3, barDur * section.bars, time)

    if (chordStart) {
      this.voicing = voiceChord(chord, this.voicing)
      this.beat('chord', time)
    }
    const voicing = this.voicing

    if (section.keys) {
      for (const [step, dur] of track.keysPattern) {
        if (step > 0 && !chance(0.8)) continue
        const vel = rand(0.3, 0.5)
        voicing.forEach((midi, i) => {
          const strum = i * rand(0.012, 0.025) + Math.abs(jitter())
          this.piano.triggerAttackRelease(toNote(midi), dur * s16, at(step) + strum, vel * (1 - i * 0.05))
        })
      }
    }

    if (section.sparse) {
      const steps = [0, 3, 6, 8, 10, 12, 14].sort(() => Math.random() - 0.5).slice(0, pick([1, 2, 2, 3]))
      for (const step of steps.sort((a, b) => a - b)) {
        const note = pick(voicing) + 12
        this.piano.triggerAttackRelease(toNote(note), 8 * s16, at(step) + jitter(), rand(0.32, 0.48))
        this.beat('note', at(step), { pitch: (note - 48) / 40 })
      }
    }

    if (section.pad && chordStart) {
      this.pad.triggerAttackRelease(voicing.map(toNote), barDur * track.barsPerChord * 0.98, time, 0.5)
    }

    if (section.bass) {
      const root = bassNote(chord.rootPc)
      if (track.mood === 'ambient') {
        if (chordStart) this.bass.triggerAttackRelease(toNote(root), barDur * track.barsPerChord * 0.95, time, 0.5)
      } else {
        for (const [step, dur, interval] of track.bassPattern) {
          this.bass.triggerAttackRelease(toNote(root + interval), dur * s16, at(step) + jitter(), rand(0.6, 0.8))
        }
      }
    }

    if (section.drums) this.playDrums(section, at, jitter)
    if (section.melody) this.playMelody(section, chord, at, s16, jitter)

    this.setAt(time, { section: section.name, chord: chord.name })

    this.sectionBar++
    if (this.sectionBar >= section.bars) {
      this.sectionBar = 0
      this.sectionIndex++
    }
  }

  playDrums(section, at, jitter) {
    const light = section.drums === 'light'
    const lastBar = this.sectionBar === section.bars - 1
    const kicks = this.track.kickPattern

    for (let step = 0; step < 16; step++) {
      const t = at(step) + jitter()
      const kickP = light ? (step === 0 ? 0.8 : 0) : (kicks[step] ?? 0)
      if (chance(kickP)) {
        const vel = step === 0 ? 0.9 : 0.7
        this.kick.triggerAttackRelease('D1', '8n', t, vel)
        this.beat('kick', t, { strength: light ? vel * 0.6 : vel })
      }

      if (step === 4 || step === 12) {
        const vel = light ? 0.35 : rand(0.55, 0.7)
        this.snare.triggerAttackRelease('16n', t, vel)
        this.snareBody.triggerAttackRelease('G2', '32n', t, vel * 0.6)
        this.beat('snare', t, { strength: vel })
      } else if ((step === 7 || step === 15 || (lastBar && step === 14)) && chance(lastBar ? 0.5 : 0.12)) {
        this.snare.triggerAttackRelease('32n', t, 0.18)
      }

      const hatP = step % 2 === 0 ? (light ? 0.5 : 0.9) : 0.12
      if (chance(hatP)) this.hat.triggerAttackRelease('32n', t, step % 4 === 0 ? rand(0.4, 0.55) : rand(0.2, 0.35))
    }
  }

  // Melodies are 2-bar phrases built from a motif: A, A', A, then A' or a rest.
  playMelody(section, chord, at, s16, jitter) {
    const track = this.track
    const half = this.sectionBar % 2
    if (half === 0) {
      const key = section.melody
      track.motifs[key] ??= makeMotif(track.mood)
      const phraseIdx = (this.sectionBar / 2) % 4
      const rest = track.mood === 'ambient' ? chance(0.35) : phraseIdx === 3 && chance(0.5)
      this.phrase = rest ? [] : phraseIdx % 2 ? varyMotif(track.motifs[key]) : track.motifs[key]
    }

    const voice = track.voices[section.melody]
    const base = voice === 'piano' ? 55 : 48
    for (const note of this.phrase) {
      const step = note.step - half * 16
      if (step < 0 || step >= 16) continue
      const midi = fitToChord(track.keyPc, note.index, chord, step % 4 === 0, base)
      const t = at(step) + jitter()
      const dur = note.dur * s16
      this.beat('note', t, { pitch: (midi - 48) / 40 })
      if (voice === 'koto') {
        if (chance(0.25)) this.koto.triggerAttack(toNote(midi - 2), t - 0.05)
        this.koto.triggerAttack(toNote(midi), t)
      } else if (voice === 'flute') {
        this.flute.triggerAttackRelease(toNote(midi), dur * 0.95, t, rand(0.6, 0.8))
        this.breath.triggerAttackRelease(dur * 0.9, t, 0.5)
      } else {
        this.piano.triggerAttackRelease(toNote(midi), dur, t, rand(0.35, 0.5))
      }
    }
  }
}

export const engine = new ZenEngine()

// Handy for poking at the engine from the browser console during development.
if (import.meta.env.DEV) window.zen = engine
