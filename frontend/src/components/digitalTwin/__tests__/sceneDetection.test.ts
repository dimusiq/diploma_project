import { PerspectiveCamera } from "three"
import { describe, expect, it } from "vitest"
import {
  cameraWorldFromAgv,
  detectInView,
  diffDetections,
  holdReason,
  stabilizeTracks,
  type ViewDetection,
} from "@/components/digitalTwin/sceneDetection.ts"
import { aisleWalkerOffset, offsetFromHeading } from "@/components/digitalTwin/twinPeoplePose.ts"
import { getShowCameraFrustum } from "@/components/digitalTwin/agvCameraBridge.ts"

function cameraLookingForward(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 640 / 360, 0.1, 40)
  camera.position.set(0, 1.7, 0)
  camera.lookAt(0, 1.2, 8)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

function pallet(z: number, id = "R04A-L2-C03") {
  return {
    id: `inventory:${id}`,
    className: "pallet",
    entityType: "inventory",
    entityId: id,
    position: { x: 0, y: 1.2, z },
    half: { x: 0.45, y: 0.5, z: 0.45 },
  }
}

describe("scene detection", () => {
  it("detects an object inside the frustum", () => {
    const found = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(6)],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found).toHaveLength(1)
    expect(found[0]?.track_id).toBe("R04A-L2-C03")
    expect(found[0]?.class_name).toBe("pallet")
    expect(found[0]?.bbox.width).toBeGreaterThan(2)
    expect(found[0]?.bbox.height).toBeGreaterThan(2)
  })

  it("ignores an object behind the camera", () => {
    const found = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(-4)],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found).toHaveLength(0)
  })

  it("ignores an object outside the field of view", () => {
    const found = detectInView({
      camera: cameraLookingForward(),
      targets: [
        {
          ...pallet(5, "side"),
          position: { x: 18, y: 1.2, z: 5 },
        },
      ],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found).toHaveLength(0)
  })

  it("hides an object behind a rack and shows one in front", () => {
    const rack = {
      id: "rack-box",
      min: { x: -2, y: 0, z: 3 },
      max: { x: 2, y: 4, z: 4.2 },
    }
    const hidden = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(8, "behind")],
      occluders: [rack],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    const visible = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(2, "front")],
      occluders: [rack],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(hidden).toHaveLength(0)
    expect(visible.map((item) => item.track_id)).toEqual(["front"])
  })

  it("does not let a rack hide a pallet stored inside it", () => {
    const found = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(5, "inside")],
      occluders: [
        {
          id: "rack-box",
          min: { x: -3, y: 0, z: 4 },
          max: { x: 3, y: 6, z: 6 },
        },
      ],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found.map((item) => item.track_id)).toEqual(["inside"])
  })

  it("keeps a stable track id and emits loss only when the object leaves", () => {
    const camera = cameraLookingForward()
    const args = {
      camera,
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    }
    const first = detectInView({ ...args, targets: [pallet(6)] })
    const second = detectInView({ ...args, targets: [pallet(6.2)] })
    expect(diffDetections(first, second)).toEqual({ appeared: [], lost: [] })
    expect(second[0]?.id).toBe(first[0]?.id)
    const gone = detectInView({ ...args, targets: [] })
    expect(diffDetections(second, gone).lost.map((item) => item.track_id)).toEqual(["R04A-L2-C03"])
    expect(diffDetections(second, gone).appeared).toHaveLength(0)
  })

  it("does not emit a new event while the same object stays visible", () => {
    const active = new Map<string, ViewDetection>()
    const missing = new Map<string, number>()
    const sample = detectInView({
      camera: cameraLookingForward(),
      targets: [pallet(6)],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    const first = stabilizeTracks(active, missing, sample)
    const second = stabilizeTracks(active, missing, sample)
    expect(diffDetections(first, second).appeared).toHaveLength(0)
    expect(diffDetections(first, second).lost).toHaveLength(0)
    const dropped = stabilizeTracks(active, missing, [])
    expect(dropped).toHaveLength(1)
    expect(stabilizeTracks(active, missing, [])).toHaveLength(0)
  })

  it("follows AGV translation and rotation", () => {
    const origin = cameraWorldFromAgv({ x: 0, z: 0, heading: 0 })
    const moved = cameraWorldFromAgv({ x: 4, z: -2, heading: 0 })
    expect(moved.x - origin.x).toBeCloseTo(4)
    expect(moved.z - origin.z).toBeCloseTo(-2)
    expect(moved.y).toBeCloseTo(1.7)
    const turned = cameraWorldFromAgv({ x: 0, z: 0, heading: Math.PI / 2 })
    expect(turned.x).toBeCloseTo(0.9)
    expect(turned.z).toBeCloseTo(0)
    expect(turned.heading - origin.heading).toBeCloseTo(Math.PI / 2)
  })

  it("holds only for a person or an obstacle", () => {
    const camera = cameraLookingForward()
    const person = detectInView({
      camera,
      targets: [
        {
          ...pallet(5, "wrk-1"),
          className: "person",
          entityType: "worker",
          id: "worker:wrk-1",
        },
      ],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(holdReason(person)).toBe("person")
    const palletOnly = detectInView({
      camera,
      targets: [pallet(5)],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(holdReason(palletOnly)).toBeNull()
  })

  it("places the demo walker in front of the AGV, then beside it", () => {
    const ahead = aisleWalkerOffset(2)
    const aside = aisleWalkerOffset(20)
    const front = offsetFromHeading(0, ahead.forward, ahead.side)
    const away = offsetFromHeading(0, aside.forward, aside.side)
    expect(front.z).toBeGreaterThan(3)
    expect(away.z).toBeLessThan(0)
    expect(Math.abs(away.x)).toBeGreaterThan(4)
  })

  it("keeps the camera frustum hidden until asked", () => {
    expect(getShowCameraFrustum()).toBe(false)
  })
})
