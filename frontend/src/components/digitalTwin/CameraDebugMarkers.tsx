import { useFrame } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import {
  ArrowHelper,
  Box3,
  Box3Helper,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Vector3,
} from "three"
import { getCameraDebug, setShowCameraFrustum } from "@/components/digitalTwin/agvCameraBridge.ts"
import type { VisibilityReason } from "@/components/digitalTwin/sceneDetection.ts"

const STATE_COLOR: Record<VisibilityReason, number> = {
  VISIBLE: 0x22c55e,
  OCCLUDED: 0xf97316,
  BEHIND_CAMERA: 0xef4444,
  OUTSIDE_FRUSTUM: 0xeab308,
  INSIDE_NEAR: 0xef4444,
  BEYOND_FAR: 0x94a3b8,
  INVALID_BBOX: 0xf97316,
}

type Guides = {
  arrow: ArrowHelper
  line: Line
  helper: Box3Helper
  box: Box3
}

const direction = new Vector3()

/**
 * Scene guides for ?cameraDebug=1. These objects carry no detection metadata.
 */
export function CameraDebugMarkers() {
  const group = useRef<Group>(null)
  const guides = useRef<Guides | null>(null)

  useEffect(() => {
    const parent = group.current
    if (!parent) return
    const box = new Box3()
    const arrow = new ArrowHelper(new Vector3(0, 0, 1), new Vector3(), 2.4, 0x38bdf8)
    const geometry = new BufferGeometry()
    geometry.setAttribute("position", new Float32BufferAttribute(new Float32Array(6), 3))
    const line = new Line(geometry, new LineBasicMaterial({ color: 0x22c55e }))
    line.frustumCulled = false
    const helper = new Box3Helper(box, new Color(0x22c55e))
    helper.frustumCulled = false
    parent.add(arrow, line, helper)
    guides.current = { arrow, line, helper, box }
    setShowCameraFrustum(true)
    return () => {
      guides.current = null
      parent.remove(arrow, line, helper)
      arrow.dispose()
      line.geometry.dispose()
      ;(line.material as LineBasicMaterial).dispose()
      helper.geometry.dispose()
      ;(helper.material as LineBasicMaterial).dispose()
      setShowCameraFrustum(false)
    }
  }, [])

  useFrame(() => {
    const current = guides.current
    if (!current) return
    const debug = getCameraDebug()
    current.arrow.visible = debug !== null
    current.line.visible = Boolean(debug?.person)
    current.helper.visible = Boolean(debug?.person)
    if (!debug) return
    current.arrow.position.set(debug.position.x, debug.position.y, debug.position.z)
    direction.set(debug.forward.x, debug.forward.y, debug.forward.z)
    if (direction.lengthSq() > 1e-8) current.arrow.setDirection(direction.normalize())
    const person = debug.person
    if (!person) return
    const color = STATE_COLOR[person.reason]
    ;(current.line.material as LineBasicMaterial).color.setHex(color)
    ;(current.helper.material as LineBasicMaterial).color.setHex(color)
    const positions = current.line.geometry.getAttribute("position")
    positions.setXYZ(0, debug.position.x, debug.position.y, debug.position.z)
    positions.setXYZ(1, person.world.x, person.world.y, person.world.z)
    positions.needsUpdate = true
    current.box.min.set(person.world.x - 0.35, person.world.y - 0.9, person.world.z - 0.3)
    current.box.max.set(person.world.x + 0.35, person.world.y + 0.9, person.world.z + 0.3)
  })

  return <group ref={group} userData={{ cameraDebug: true }} />
}
