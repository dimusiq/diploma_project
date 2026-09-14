import { useFrame, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import { Euler, Vector3 } from "three"

const _freeCamSpeed = 8
const FREE_CAM_CODES = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Space",
  "ShiftLeft",
  "ShiftRight",
])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  )
}

export function FreeCameraController() {
  const { camera, gl } = useThree()
  const yaw = useRef(0)
  const pitch = useRef(0)
  const mouseDown = useRef(false)
  const initialized = useRef(false)
  const keysRef = useRef(new Set<string>())

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true
      const e = new Euler().setFromQuaternion(camera.quaternion, "YXZ")
      yaw.current = e.y
      pitch.current = e.x
    }
  }, [camera])

  useEffect(() => {
    const canvas = gl.domElement

    const onPointerDown = (e: PointerEvent) => {
      mouseDown.current = true
      canvas.setPointerCapture(e.pointerId)
    }
    const onPointerUp = (e: PointerEvent) => {
      mouseDown.current = false
      canvas.releasePointerCapture(e.pointerId)
    }
    const onPointerMove = (e: PointerEvent) => {
      if (!mouseDown.current) return
      yaw.current -= e.movementX * 0.003
      pitch.current -= e.movementY * 0.003
      pitch.current = Math.max(
        -Math.PI / 2 + 0.05,
        Math.min(Math.PI / 2 - 0.05, pitch.current),
      )
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const fwd = new Vector3(0, 0, -1).applyEuler(
        new Euler(pitch.current, yaw.current, 0, "YXZ"),
      )
      camera.position.addScaledVector(fwd, -e.deltaY * 0.02)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (!FREE_CAM_CODES.has(e.code)) return
      e.preventDefault()
      keysRef.current.add(e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.code)
    }
    const onBlur = () => {
      keysRef.current.clear()
    }
    const onContextMenu = (e: Event) => e.preventDefault()

    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointerup", onPointerUp)
    canvas.addEventListener("pointerleave", onPointerUp)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("wheel", onWheel, { passive: false })
    canvas.addEventListener("contextmenu", onContextMenu)
    window.addEventListener("keydown", onKeyDown)
    window.addEventListener("keyup", onKeyUp)
    window.addEventListener("blur", onBlur)
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointerup", onPointerUp)
      canvas.removeEventListener("pointerleave", onPointerUp)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("wheel", onWheel)
      canvas.removeEventListener("contextmenu", onContextMenu)
      window.removeEventListener("keydown", onKeyDown)
      window.removeEventListener("keyup", onKeyUp)
      window.removeEventListener("blur", onBlur)
      keysRef.current.clear()
    }
  }, [gl, camera])

  useFrame((_, delta) => {
    const camEuler = new Euler(pitch.current, yaw.current, 0, "YXZ")
    camera.quaternion.setFromEuler(camEuler)

    const speed = _freeCamSpeed * delta

    const forward = new Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
    const right = new Vector3(1, 0, 0).applyQuaternion(camera.quaternion)

    const keys = keysRef.current
    if (keys.has("KeyW") || keys.has("ArrowUp"))
      camera.position.addScaledVector(forward, speed)
    if (keys.has("KeyS") || keys.has("ArrowDown"))
      camera.position.addScaledVector(forward, -speed)
    if (keys.has("KeyA") || keys.has("ArrowLeft"))
      camera.position.addScaledVector(right, -speed)
    if (keys.has("KeyD") || keys.has("ArrowRight"))
      camera.position.addScaledVector(right, speed)

    if (keys.has("Space")) camera.position.y += speed
    if (keys.has("ShiftLeft") || keys.has("ShiftRight"))
      camera.position.y -= speed
  })

  return null
}
