import { useRef } from 'react'
import './GlassCard.css'

export default function GlassCard({ as: Tag = 'section', className = '', radius = 16, beam = false, children, ...rest }) {
  const ref = useRef(null)

  // The specular highlight follows the pointer, like light catching glass.
  const onPointerMove = (e) => {
    const box = ref.current.getBoundingClientRect()
    ref.current.style.setProperty('--mx', `${e.clientX - box.left}px`)
    ref.current.style.setProperty('--my', `${e.clientY - box.top}px`)
  }

  return (
    <Tag
      ref={ref}
      className={`glass ${className}`}
      style={{ '--glass-radius': `${radius}px` }}
      onPointerMove={onPointerMove}
      {...rest}
    >
      {beam && <span className="glass-beam" aria-hidden="true" />}
      {children}
    </Tag>
  )
}
