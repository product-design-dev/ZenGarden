// A plain native range input (keyboard and screen-reader friendly), styled in
// App.css; --value drives the filled part of the track.
export default function Slider({ label, value, onChange }) {
  return (
    <label className="slider">
      <span className="slider-label">{label}</span>
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--value': `${value * 100}%` }}
      />
      <span className="slider-value">{Math.round(value * 100)}</span>
    </label>
  )
}
