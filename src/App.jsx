import { useEffect, useState, useSyncExternalStore } from 'react'
import { engine } from './music/engine.js'
import DotField from './visuals/DotField.jsx'
import Slider from './components/Slider.jsx'
import GlassCard from './components/GlassCard.jsx'
import './App.css'

const LAYERS = [
  { id: 'music', label: 'Music' },
  { id: 'vinyl', label: 'Vinyl' },
  { id: 'rain', label: 'Rain' },
  { id: 'wind', label: 'Wind' },
  { id: 'ocean', label: 'Ocean' },
]

const MOODS = [
  { id: 'lofi', label: 'Lofi' },
  { id: 'ambient', label: 'Ambient' },
]

function App() {
  const state = useSyncExternalStore(engine.subscribe, engine.getState)
  const { status, track, section, chord, mood, levels } = state
  const playing = status === 'playing'
  const [mixerOpen, setMixerOpen] = useState(false)

  useEffect(() => {
    if (!mixerOpen) return
    const onKey = (e) => e.key === 'Escape' && setMixerOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mixerOpen])

  return (
    <>
      <DotField />
      <button
        type="button"
        className="corner-button"
        aria-label="Mixer"
        title="Mixer"
        aria-expanded={mixerOpen}
        aria-controls="mixer"
        onClick={() => setMixerOpen((open) => !open)}
      >
        <MixerIcon />
      </button>
      <main className={`app ${playing ? 'is-playing' : ''}`}>
        <header className="brand">
          <h1>ZenGarden</h1>
          <p>Endless lofi for slow breaks</p>
        </header>

        <section className="player">
          <div className="orb" aria-hidden="true" />
          <button
            type="button"
            className="play"
            onClick={() => engine.toggle()}
            disabled={status === 'loading'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {status === 'loading' ? <span className="spinner" /> : playing ? <PauseIcon /> : <PlayIcon />}
          </button>

          <div className="now-playing" aria-live="polite">
            {status === 'idle' && <p className="hint">Press play. Every track is composed as you listen.</p>}
            {status === 'loading' && <p className="hint">Tuning the instruments…</p>}
            {status === 'error' && <p className="hint">Couldn't start the audio. Try again?</p>}
            {track && status !== 'loading' && (
              <>
                <h2>{track.name}</h2>
                <p className="meta">
                  {track.keyName} major · {track.bpm} bpm
                  {section && ` · ${section}`}
                  {chord && ` · ${chord}`}
                </p>
              </>
            )}
          </div>
        </section>

        <section className="controls">
          <div className="moods" role="radiogroup" aria-label="Mood">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mood === m.id}
                className={mood === m.id ? 'active' : ''}
                onClick={() => engine.setMood(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="skip" onClick={() => engine.skip()} disabled={!track}>
            New track
          </button>
        </section>

        <div className={`mixer-drawer ${mixerOpen ? 'open' : ''}`}>
          <GlassCard id="mixer" className="mixer" beam aria-labelledby="mixer-title">
            <header className="mixer-header">
              <span className="tag">Mixer</span>
              <h3 id="mixer-title">Soundscape</h3>
              <p>Blend the music with sounds of nature</p>
            </header>
            {LAYERS.map((layer) => (
              <Slider
                key={layer.id}
                label={layer.label}
                value={levels[layer.id]}
                onChange={(value) => engine.setLevel(layer.id, value)}
              />
            ))}
            <p className="credits">
              Piano samples: Salamander Grand Piano by Alexander Holm,{' '}
              <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">
                CC BY 3.0
              </a>
              , processed
            </p>
          </GlassCard>
        </div>
      </main>
    </>
  )
}

function MixerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M8.85048 4.53906C7.63209 4.53906 6.64478 5.52653 6.64478 6.74523C6.64478 7.96273 7.63188 8.95025 8.85048 8.95025C10.0543 8.95025 11.0324 7.9865 11.0561 6.7896C11.0553 6.77492 11.0548 6.76012 11.0548 6.74523C11.0548 6.7303 11.0553 6.71548 11.0561 6.70077C11.0325 5.50272 10.0542 4.53906 8.85048 4.53906ZM12.4807 5.99523C12.134 4.30783 10.6405 3.03906 8.85048 3.03906C7.06034 3.03906 5.56732 4.30795 5.22068 5.99523H3C2.58579 5.99523 2.25 6.33101 2.25 6.74523C2.25 7.15944 2.58579 7.49522 3 7.49522H5.22074C5.56752 9.18178 7.06063 10.4502 8.85048 10.4502C10.6402 10.4502 12.1337 9.18182 12.4806 7.49522H21C21.4142 7.49522 21.75 7.15944 21.75 6.74523C21.75 6.33101 21.4142 5.99523 21 5.99523H12.4807ZM15.4185 15.0486C14.1999 15.0486 13.2128 16.0362 13.2128 17.2538C13.2128 18.4724 14.2 19.4598 15.4185 19.4598C16.6365 19.4598 17.6228 18.4729 17.6228 17.2538C17.6228 16.0358 16.6366 15.0486 15.4185 15.0486ZM11.7887 16.5038C12.1355 14.8172 13.6286 13.5486 15.4185 13.5486C17.2087 13.5486 18.7004 14.8175 19.0469 16.5038H21C21.4142 16.5038 21.75 16.8396 21.75 17.2538C21.75 17.668 21.4142 18.0038 21 18.0038H19.047C18.7006 19.6908 17.2089 20.9598 15.4185 20.9598C13.6284 20.9598 12.1353 19.6911 11.7887 18.0038H3C2.58579 18.0038 2.25 17.668 2.25 17.2538C2.25 16.8396 2.58579 16.5038 3 16.5038H11.7887Z"
      />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor" />
    </svg>
  )
}

export default App
