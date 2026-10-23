import * as Tone from 'tone'
import { rand } from './theory.js'

// Vinyl crackle, generated once into a buffer: faint hiss plus lots of tiny
// clicks and the occasional bigger pop.
function makeCrackleBuffer(seconds = 8) {
  const sampleRate = Tone.getContext().sampleRate
  const length = Math.floor(sampleRate * seconds)
  const data = new Float32Array(length)
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * 0.005

  const count = Math.floor(seconds * 45)
  for (let c = 0; c < count; c++) {
    const start = Math.floor(Math.random() * length)
    const big = Math.random() < 0.05
    const amp = big ? rand(0.2, 0.45) : rand(0.02, 0.1)
    const len = Math.floor(sampleRate * (big ? rand(0.002, 0.005) : rand(0.0003, 0.0012)))
    for (let j = 0; j < len && start + j < length; j++) {
      data[start + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / (len * 0.3))
    }
  }
  return Tone.ToneAudioBuffer.fromArray(data)
}

// Each texture gets a level gain (driven by the UI sliders) into `destination`.
// `scale` keeps slider 1.0 at a comfortable loudness for each one.
export function createTextures(destination) {
  const levels = {
    vinyl: { gain: new Tone.Gain(0).connect(destination), scale: 1.4 },
    rain: { gain: new Tone.Gain(0).connect(destination), scale: 0.35 },
    wind: { gain: new Tone.Gain(0).connect(destination), scale: 0.9 },
    ocean: { gain: new Tone.Gain(0).connect(destination), scale: 0.4 },
  }

  const vinyl = new Tone.Player({ url: makeCrackleBuffer(), loop: true })
  vinyl.chain(
    new Tone.Filter(300, 'highpass'),
    new Tone.Filter(7000, 'lowpass'),
    levels.vinyl.gain,
  )

  // Rain: pink noise shaped into a soft hiss, swelling slowly.
  const rain = new Tone.Noise('pink')
  const rainSwell = new Tone.Gain(1)
  new Tone.LFO({ frequency: 0.05, min: 0.6, max: 1 }).connect(rainSwell.gain).start()
  rain.chain(
    new Tone.Filter(600, 'highpass'),
    new Tone.Filter(3200, 'lowpass'),
    rainSwell,
    levels.rain.gain,
  )

  // Wind: brown noise through a band-pass that slowly drifts.
  const wind = new Tone.Noise('brown')
  const windFilter = new Tone.Filter({ type: 'bandpass', frequency: 450, Q: 1.2 })
  new Tone.LFO({ frequency: 0.04, min: 220, max: 800 }).connect(windFilter.frequency).start()
  wind.chain(windFilter, levels.wind.gain)

  // Ocean: two wave voices on their own irregular cycles, so the swells
  // overlap differently every time instead of looping.
  const ocean = [createWave(levels.ocean.gain), createWave(levels.ocean.gain)]

  return { sources: [vinyl, rain, wind, ...ocean], levels }
}

function createWave(destination) {
  const noise = new Tone.Noise('pink')
  const filter = new Tone.Filter({ type: 'lowpass', frequency: 350, Q: 0.3 })
  const swell = new Tone.Gain(0.1)
  noise.chain(new Tone.Filter(80, 'highpass'), filter, swell, destination)

  // Each wave rolls in (louder, brighter as it breaks), then drags back out.
  const roll = () => {
    const now = Tone.now()
    const rise = rand(2.5, 4.5)
    const fall = rand(4, 7)
    swell.gain.setValueAtTime(0.1, now)
    swell.gain.linearRampToValueAtTime(rand(0.6, 1), now + rise)
    swell.gain.linearRampToValueAtTime(0.1, now + rise + fall)
    filter.frequency.setValueAtTime(350, now)
    filter.frequency.exponentialRampToValueAtTime(rand(1400, 2200), now + rise)
    filter.frequency.exponentialRampToValueAtTime(350, now + rise + fall)
    setTimeout(roll, (rise + fall + rand(0, 2)) * 1000)
  }
  setTimeout(roll, rand(0, 4000))
  return noise
}
