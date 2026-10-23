import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { engine } from '../music/engine.js'
import { rand } from '../music/theory.js'

const MAX_RIPPLES = 16

const vertexShader = /* glsl */ `
  #define MAX_RIPPLES ${MAX_RIPPLES}
  uniform float uTime;
  uniform float uEnergy;
  uniform float uSwell;
  uniform float uPixelRatio;
  uniform vec4 uRipples[MAX_RIPPLES]; // x, z, start time, strength
  attribute vec3 aRand;               // size, color pick, phase
  varying float vGlow;
  varying float vFade;
  varying float vColor;

  // Layered sine "hills" that slowly roll through the field.
  float hills(vec2 p, float t) {
    return sin(p.x * 0.18 + t * 0.35) * 0.9
      + sin(p.y * 0.23 - t * 0.27 + p.x * 0.07) * 0.8
      + sin((p.x + p.y) * 0.41 + t * 0.5 + aRand.z) * 0.25;
  }

  void main() {
    vec3 p = position;
    // The ground nearest the camera stays mostly put so the bottom of the
    // screen never empties out; the big motion happens mid-field and beyond.
    float grounded = mix(0.35, 1.0, smoothstep(6.0, -8.0, p.z));
    float h = hills(p.xz, uTime) * (1.0 + uEnergy * 0.45 + uSwell * 0.25) * grounded;

    // Each beat sends out a ring that lifts and lights the dots it passes.
    float glow = 0.0;
    for (int i = 0; i < MAX_RIPPLES; i++) {
      vec4 r = uRipples[i];
      float age = uTime - r.z;
      if (r.w <= 0.0 || age < 0.0 || age > 4.0) continue;
      float d = distance(p.xz, r.xy);
      float ring = exp(-pow(d - age * 7.0, 2.0) * 0.5) * exp(-age * 1.2) * r.w;
      h += ring * 0.6 * grounded;
      glow += ring;
    }
    p.y += h;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    // Capped so the dots nearest the camera stay beads, not blobs.
    gl_PointSize = min(mix(1.4, 3.6, aRand.x) * (1.0 + glow * 0.5) * (14.0 / -mv.z), 9.0) * uPixelRatio;

    vGlow = glow + max(h, 0.0) * 0.12 + uSwell * 0.15;
    vFade = smoothstep(46.0, 14.0, -mv.z) * smoothstep(30.0, 16.0, abs(p.x));
    vColor = aRand.y;
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uGreen;
  uniform vec3 uTeal;
  uniform vec3 uLime;
  varying float vGlow;
  varying float vFade;
  varying float vColor;

  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5) discard;

    vec3 col = vColor < 0.55 ? uGreen : vColor < 0.85 ? uTeal : uLime;
    // Light from the top-left so each dot reads as a tiny bead.
    float shade = 0.7 + 0.45 * (1.0 - length(c - vec2(-0.15, 0.15)) * 2.0);
    col *= shade * (0.75 + vGlow * 0.8);

    gl_FragColor = vec4(col, smoothstep(0.5, 0.3, d) * vFade);
  }
`

function buildField(cols, rows) {
  const positions = new Float32Array(cols * rows * 3)
  const randoms = new Float32Array(cols * rows * 3)
  let i = 0
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      positions[i] = (c / (cols - 1) - 0.5) * 60 + rand(-0.12, 0.12)
      positions[i + 1] = 0
      positions[i + 2] = 6 - (r / (rows - 1)) * 50 + rand(-0.12, 0.12)
      randoms[i] = Math.random() ** 2
      randoms[i + 1] = Math.random()
      randoms[i + 2] = Math.random() * Math.PI * 2
      i += 3
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aRand', new THREE.BufferAttribute(randoms, 3))
  return geometry
}

export default function DotField() {
  const mountRef = useRef(null)

  useEffect(() => {
    const mount = mountRef.current
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const small = window.innerWidth < 700

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    const lookAt = new THREE.Vector3(0, 1.2, -10)

    const ripples = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0))
    const uniforms = {
      uTime: { value: 0 },
      uEnergy: { value: 0 },
      uSwell: { value: 0 },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uRipples: { value: ripples },
      uGreen: { value: new THREE.Color('#3f9f62') },
      uTeal: { value: new THREE.Color('#2a9d8f') },
      uLime: { value: new THREE.Color('#c9d46c') },
    }
    const geometry = small ? buildField(170, 110) : buildField(300, 190)
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      transparent: true,
      depthWrite: false,
    })
    scene.add(new THREE.Points(geometry, material))

    const clock = new THREE.Clock()
    let nextRipple = 0
    let swell = 0
    const addRipple = (x, z, strength) => {
      ripples[nextRipple].set(x, z, uniforms.uTime.value, calm ? strength * 0.3 : strength)
      nextRipple = (nextRipple + 1) % MAX_RIPPLES
    }

    const offBeat = engine.onBeat((type, data) => {
      if (type === 'kick') addRipple(rand(-8, 8), rand(-16, -5), data.strength * 1.2)
      else if (type === 'snare') addRipple(rand(-14, 14), rand(-24, -8), data.strength * 0.7)
      else if (type === 'note') addRipple(-16 + data.pitch * 32, rand(-22, -8), 0.45)
      else if (type === 'chord') swell = 1
      else if (type === 'track') addRipple(0, -10, 1.6)
    })

    const resize = () => {
      const { innerWidth: w, innerHeight: h } = window
      renderer.setSize(w, h)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    window.addEventListener('resize', resize)

    let frame
    const tick = () => {
      const dt = Math.min(clock.getDelta(), 0.1)
      const t = uniforms.uTime.value + dt * (calm ? 0.3 : 1)
      uniforms.uTime.value = t
      uniforms.uEnergy.value += (engine.getLevel() - uniforms.uEnergy.value) * Math.min(1, dt * 1.2)
      swell = Math.max(0, swell - dt * 0.5)
      uniforms.uSwell.value = swell * swell

      camera.position.set(Math.sin(t * 0.03) * 1.5, 3.4, 9)
      camera.lookAt(lookAt)
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(frame)
      offBeat()
      window.removeEventListener('resize', resize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="dot-field" aria-hidden="true" />
}
