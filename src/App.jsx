import { useSyncExternalStore } from 'react'
import { engine } from './music/engine.js'
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

  return (
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

      <section className="mixer" aria-label="Sound mixer">
        {LAYERS.map((layer) => (
          <label key={layer.id}>
            <span>{layer.label}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={levels[layer.id]}
              onChange={(e) => engine.setLevel(layer.id, Number(e.target.value))}
            />
          </label>
        ))}
      </section>

      <footer className="credits">
        Piano: Salamander Grand Piano by Alexander Holm (CC BY 3.0)
      </footer>
    </main>
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
