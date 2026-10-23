// Music theory helpers: keys, jazzy chord qualities, progressions, voicings,
// and a pentatonic melody generator. Everything here is plain data/math so the
// audio engine can stay focused on sound and timing.

export const NOTE_NAMES = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
const SHARP_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const SHARP_KEYS = [2, 4, 7, 9, 11]

// Intervals (semitones above the chord root).
export const QUALITIES = {
  maj7: { intervals: [0, 4, 7, 11], label: 'maj7' },
  maj9: { intervals: [0, 4, 7, 11, 14], label: 'maj9' },
  six9: { intervals: [0, 4, 7, 9, 14], label: '6/9' },
  m7: { intervals: [0, 3, 7, 10], label: 'm7' },
  m9: { intervals: [0, 3, 7, 10, 14], label: 'm9' },
  m11: { intervals: [0, 3, 7, 10, 14, 17], label: 'm11' },
  sus9: { intervals: [0, 5, 7, 10, 14], label: '9sus' },
}

// Progressions in a major key: [root offset from key, quality].
export const PROGRESSIONS = {
  lofi: [
    [[5, 'maj9'], [4, 'm7'], [9, 'm9'], [0, 'maj9']],
    [[2, 'm9'], [7, 'sus9'], [0, 'maj9'], [9, 'm9']],
    [[0, 'maj9'], [9, 'm9'], [2, 'm11'], [5, 'maj7']],
    [[9, 'm9'], [5, 'maj9'], [0, 'six9'], [7, 'sus9']],
    [[5, 'maj7'], [0, 'maj9'], [2, 'm9'], [4, 'm7']],
  ],
  ambient: [
    [[5, 'maj9'], [0, 'six9']],
    [[0, 'maj9'], [9, 'm11'], [5, 'maj9'], [0, 'six9']],
    [[2, 'm11'], [0, 'maj9']],
    [[9, 'm9'], [5, 'maj9'], [0, 'maj9'], [7, 'sus9']],
  ],
}

// Major pentatonic: no half steps, so it never clashes hard. The zen sound.
export const PENTATONIC = [0, 2, 4, 7, 9]

export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const rand = (min, max) => min + Math.random() * (max - min)
export const chance = (p) => Math.random() < p

export function buildChord(keyPc, [offset, quality]) {
  const rootPc = (keyPc + offset) % 12
  const { intervals, label } = QUALITIES[quality]
  return {
    rootPc,
    pcs: intervals.map((i) => (rootPc + i) % 12),
    // Upper structure (no root): the bass covers the root.
    upper: intervals.slice(1).map((i) => (rootPc + i) % 12),
    name: (SHARP_KEYS.includes(keyPc) ? SHARP_NAMES : NOTE_NAMES)[rootPc] + label,
  }
}

// Place pitch classes as a close voicing starting at or above `floor`.
function stack(pcs, floor) {
  const notes = []
  let prev = floor - 1
  for (const pc of pcs) {
    let n = prev + 1
    while (((n % 12) + 12) % 12 !== pc) n++
    notes.push(n)
    prev = n
  }
  return notes
}

// Choose the inversion that moves least from the previous voicing (smooth
// voice leading is a big part of why lofi keys sound "warm" instead of jumpy).
export function voiceChord(chord, prevVoicing, { low = 52, high = 77 } = {}) {
  const tones = chord.upper
  const target = prevVoicing ? avg(prevVoicing) : 63
  let best = null
  for (let r = 0; r < tones.length; r++) {
    const rotated = [...tones.slice(r), ...tones.slice(0, r)]
    for (let floor = low; floor <= low + 11; floor++) {
      const v = stack(rotated, floor)
      if (v[0] !== floor || v[v.length - 1] > high) continue
      const score = Math.abs(avg(v) - target) + (v[v.length - 1] - v[0]) * 0.15
      if (!best || score < best.score) best = { v, score }
    }
  }
  return best ? best.v : stack(tones, low)
}

export function bassNote(rootPc, low = 36) {
  let n = low
  while (n % 12 !== rootPc) n++
  return n
}

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length

// Pentatonic index -> MIDI note. Index 0 is the key root at `base`.
export function pentNote(keyPc, index, base = 60) {
  const octave = Math.floor(index / 5)
  const degree = ((index % 5) + 5) % 5
  return base + keyPc + octave * 12 + PENTATONIC[degree]
}

// Rhythms for a 2-bar motif, as [step, duration] in 16th notes.
const MOTIF_RHYTHMS = {
  lofi: [
    [[0, 3], [4, 2], [6, 6], [16, 4], [22, 8]],
    [[2, 2], [4, 4], [10, 6], [18, 2], [20, 10]],
    [[0, 6], [8, 2], [10, 4], [14, 2], [24, 8]],
    [[4, 2], [6, 2], [8, 8], [20, 2], [22, 2], [24, 8]],
    [[0, 4], [6, 10], [18, 4], [24, 8]],
  ],
  ambient: [
    [[0, 12], [16, 16]],
    [[4, 8], [14, 18]],
    [[0, 6], [8, 8], [20, 12]],
  ],
}

// A motif is a short phrase stored as pentatonic indices, so it can be
// replayed over any chord and still fit.
export function makeMotif(mood) {
  const rhythm = pick(MOTIF_RHYTHMS[mood])
  let index = Math.round(rand(4, 8))
  return rhythm.map(([step, dur]) => {
    const move = pick([-2, -1, -1, 0, 1, 1, 2])
    index = Math.min(10, Math.max(2, index + move))
    return { step, dur, index }
  })
}

// Small variation: nudge the last note or two so repeats don't feel copied.
export function varyMotif(motif) {
  return motif.map((n, i) =>
    i >= motif.length - 2 && chance(0.6)
      ? { ...n, index: Math.min(10, Math.max(2, n.index + pick([-1, 1, 2]))) }
      : n,
  )
}

// On strong beats, nudge the note to the nearest chord tone so the melody
// lands on something that sounds intentional.
export function fitToChord(keyPc, index, chord, strong, base) {
  const fits = (i) => chord.pcs.includes(pentNote(keyPc, i, base) % 12)
  if (!strong || fits(index)) return pentNote(keyPc, index, base)
  for (const d of [1, -1, 2, -2]) {
    if (fits(index + d)) return pentNote(keyPc, index + d, base)
  }
  return pentNote(keyPc, index, base)
}

const NAME_A = ['Moss', 'Cedar', 'Lantern', 'Koi', 'Bamboo', 'Stone', 'Mist', 'Willow', 'Lotus', 'Pine', 'Tea', 'Temple', 'River', 'Maple', 'Sakura', 'Moon', 'Pebble', 'Cloud', 'Paper', 'Ink']
const NAME_B = ['Garden', 'Path', 'Pond', 'Bridge', 'Shrine', 'Hollow', 'Courtyard', 'Steps', 'Grove', 'Veranda', 'Window', 'Gate']
const NAME_C = ['Late Afternoon', 'at Dusk', 'Before Dawn', 'in the Rain', 'After Tea', 'Morning', 'Midnight', 'First Snow', 'Golden Hour', 'Slow Sunday']

export function trackName() {
  return `${pick(NAME_A)} ${pick(NAME_B)}, ${pick(NAME_C)}`
}
