import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"

export type TwinPerfSnapshot = {
  fps: number
  calls: number
  triangles: number
  geometries: number
  textures: number
  objects: number
}

export const twinPerfSnapshot: TwinPerfSnapshot = {
  fps: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  objects: 0,
}

/**
 * Samples renderer.info. Mount inside the Canvas.
 * Visible in dev and with ?perf=1.
 * Record four scenes separately: idle warehouse, full fleet, running simulation, moving fleet.
 * One FPS sample is an observation for that browser and scene, not a score.
 */
export function TwinPerfSampler({ enabled }: { enabled: boolean }) {
  const { gl, scene } = useThree()
  const acc = useRef({ t: 0, frames: 0 })

  useFrame((_, dt) => {
    if (!enabled) return
    acc.current.t += dt
    acc.current.frames += 1
    if (acc.current.t < 0.5) return
    const fps = acc.current.frames / acc.current.t
    acc.current.t = 0
    acc.current.frames = 0
    let objects = 0
    scene.traverse(() => {
      objects += 1
    })
    twinPerfSnapshot.fps = Math.round(fps)
    twinPerfSnapshot.calls = gl.info.render.calls
    twinPerfSnapshot.triangles = gl.info.render.triangles
    twinPerfSnapshot.geometries = gl.info.memory.geometries
    twinPerfSnapshot.textures = gl.info.memory.textures
    twinPerfSnapshot.objects = objects
    const el = document.getElementById("twin-perf-hud")
    if (el) {
      el.textContent =
        `FPS ${twinPerfSnapshot.fps}  ·  Draw calls ${twinPerfSnapshot.calls}  ·  ` +
        `Tris ${twinPerfSnapshot.triangles}  ·  Geoms ${twinPerfSnapshot.geometries}  ·  ` +
        `Textures ${twinPerfSnapshot.textures}  ·  Objects ${twinPerfSnapshot.objects}`
    }
  })
  return null
}

export function TwinPerfHud({ enabled }: { enabled: boolean }) {
  const shown = enabled
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!shown && ref.current) ref.current.textContent = ""
  }, [shown])
  if (!shown) return null
  return (
    <div
      id="twin-perf-hud"
      ref={ref}
      className="pointer-events-none absolute right-2 bottom-10 z-10 rounded-md border bg-background/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-sm"
    />
  )
}
