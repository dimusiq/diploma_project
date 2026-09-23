import { PerspectiveCamera } from "three"
import { describe, expect, it } from "vitest"
import {
  cameraWorldFromAgv,
  clampDetectionBox,
  detectInView,
  diffDetections,
  explainTarget,
  formatPersonDebug,
  holdReason,
  isDetectionCandidate,
  placeDetectionLabel,
  selectDetectionCandidates,
  stabilizeTracks,
  type CameraDebugSnapshot,
  type SceneTarget,
  type ViewDetection,
} from "@/components/digitalTwin/sceneDetection.ts"
import { crewPlanPosition } from "@/components/digitalTwin/twinPeoplePose.ts"
import { getShowCameraFrustum } from "@/components/digitalTwin/agvCameraBridge.ts"

function cameraLookingForward(): PerspectiveCamera {
  const camera = new PerspectiveCamera(50, 640 / 360, 0.1, 40)
  camera.position.set(0, 1.7, 0)
  camera.lookAt(0, 1.2, 8)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

function agvCamera(): PerspectiveCamera {
  const camera = new PerspectiveCamera(55, 16 / 9, 0.12, 40)
  camera.position.set(0, 1.7, 0)
  camera.rotation.y = Math.PI
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
  return camera
}

function personAt(x: number, z: number, id = "wrk-1"): SceneTarget {
  return {
    id: `worker:${id}`,
    className: "person",
    entityType: "worker",
    entityId: id,
    position: { x, y: 0.9, z },
    half: { x: 0.28, y: 0.85, z: 0.22 },
  }
}

function seePerson(camera: PerspectiveCamera, target: SceneTarget) {
  return detectInView({
    camera,
    targets: [target],
    occluders: [],
    width: 640,
    height: 360,
    equipmentId: "agv-1",
  })
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

  it("does not detect a pallet stored inside a rack", () => {
    const stored = {
      ...pallet(5, "inside"),
      sceneRole: "storage_content" as const,
    }
    const found = detectInView({
      camera: cameraLookingForward(),
      targets: [stored],
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
    expect(found).toHaveLength(0)
    expect(isDetectionCandidate(stored)).toBe(false)
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

  it("keeps a worker at one plan pose instead of walking into the camera", () => {
    const pose = crewPlanPosition(0)
    expect(pose).toEqual({ x: 14, z: 42, heading: 0 })
    expect(crewPlanPosition(0)).toEqual(pose)
    expect(crewPlanPosition(1).x).not.toBe(pose.x)
  })

  it("detects a person only while they are in front of the AGV camera", () => {
    const camera = agvCamera()
    const ahead = seePerson(camera, personAt(0, 4))
    expect(ahead.map((item) => item.class_name)).toEqual(["person"])
    expect(explainTarget(camera, personAt(0, 4), [], 640, 360).reason).toBe("VISIBLE")

    const beside = seePerson(camera, personAt(8, 4))
    expect(beside).toHaveLength(0)
    expect(explainTarget(camera, personAt(8, 4), [], 640, 360).reason).toBe("OUTSIDE_FRUSTUM")

    const behind = seePerson(camera, personAt(0, -3))
    expect(behind).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, -3), [], 640, 360).reason).toBe("BEHIND_CAMERA")
    expect(explainTarget(camera, personAt(0, -3), [], 640, 360).cameraSpace.z).toBeGreaterThan(0)

    const immediatelyBehind = seePerson(camera, personAt(0, -1))
    expect(immediatelyBehind).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, -1), [], 640, 360).reason).toBe("BEHIND_CAMERA")

    const closeBeside = seePerson(camera, personAt(3, 0.2))
    expect(closeBeside).toHaveLength(0)

    const farAhead = seePerson(camera, personAt(0, 25))
    expect(farAhead).toHaveLength(1)

    const beyondFar = seePerson(camera, personAt(0, 50))
    expect(beyondFar).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, 50), [], 640, 360).reason).toBe("BEYOND_FAR")

    const occluded = detectInView({
      camera,
      targets: [personAt(0, 8)],
      occluders: [{ id: "rack", min: { x: -2, y: 0, z: 3 }, max: { x: 2, y: 4, z: 4 } }],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(occluded).toHaveLength(0)
    expect(
      explainTarget(
        camera,
        personAt(0, 8),
        [{ id: "rack", min: { x: -2, y: 0, z: 3 }, max: { x: 2, y: 4, z: 4 } }],
        640,
        360,
      ).reason,
    ).toBe("OCCLUDED")

    const returned = seePerson(camera, personAt(0, 4))
    expect(returned).toHaveLength(1)
    expect(returned[0]?.bbox.width).toBeGreaterThan(0)
    expect(returned[0]?.bbox.height).toBeGreaterThan(0)
  })

  it("rejects boxes outside the clip range and clips partial boxes", () => {
    const camera = agvCamera()
    camera.near = 2
    camera.updateProjectionMatrix()
    expect(seePerson(camera, personAt(0, 0.4))).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, 0.4), [], 640, 360).reason).not.toBe("VISIBLE")
    expect(clampDetectionBox({ x: Number.NaN, y: 0, width: 10, height: 10 }, 640, 360)).toBeNull()
    expect(clampDetectionBox({ x: -30, y: -20, width: 10, height: 8 }, 640, 360)).toBeNull()
    const clipped = clampDetectionBox({ x: -10, y: 20, width: 80, height: 40 }, 100, 50)
    expect(clipped).toEqual({ x: 0, y: 20, width: 70, height: 30 })
    const low = placeDetectionLabel({ x: 10, y: 4, width: 20, height: 20 }, 640, 360, 132, 32)
    expect(low.y).toBeGreaterThanOrEqual(4)
    const right = placeDetectionLabel({ x: 600, y: 80, width: 30, height: 40 }, 640, 360, 132, 32)
    expect(right.x + 132).toBeLessThanOrEqual(640)
    const bottom = placeDetectionLabel({ x: 20, y: 340, width: 40, height: 30 }, 640, 360, 132, 32)
    expect(bottom.y + 32).toBeLessThanOrEqual(360)
  })

  it("keeps the camera frustum hidden until asked", () => {
    expect(getShowCameraFrustum()).toBe(false)
  })

  it("keeps a stationary person detected across ticks", () => {
    const camera = agvCamera()
    const person = personAt(0.35, 4.2)
    const ticks = Array.from({ length: 8 }, () => seePerson(camera, person))
    for (const tick of ticks) {
      expect(tick).toHaveLength(1)
      expect(tick[0]?.track_id).toBe("wrk-1")
      expect(tick[0]?.bbox).toEqual(ticks[0]?.[0]?.bbox)
    }
  })

  it("keeps a person detected while they walk in front of the camera", () => {
    const camera = agvCamera()
    for (let z = 3; z <= 8; z += 0.4) {
      const found = seePerson(camera, personAt(0.35, z))
      expect(found.map((item) => item.track_id)).toEqual(["wrk-1"])
    }
  })

  it("does not drop a person when closer pallets fill the raycast cap", () => {
    const camera = agvCamera()
    const closer = Array.from({ length: 20 }, (_, index) => ({
      ...pallet(1.4, `P${index}`),
      id: `inventory:P${index}`,
      entityId: `P${index}`,
      position: { x: (index % 5) * 0.15 - 0.3, y: 1.2, z: 1.4 + index * 0.08 },
    }))
    const found = detectInView({
      camera,
      targets: [...closer, personAt(0.35, 6)],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found.some((item) => item.track_id === "wrk-1")).toBe(true)
    expect(found.filter((item) => item.class_name === "pallet").length).toBeLessThanOrEqual(12)
  })

  it("does not let the camera AGV occlude its own view", () => {
    const camera = agvCamera()
    const found = detectInView({
      camera,
      targets: [personAt(0, 5)],
      occluders: [
        {
          id: "agv-body",
          ownerId: "agv-1",
          min: { x: -1.2, y: 0, z: 0.4 },
          max: { x: 1.2, y: 2.2, z: 2.4 },
        },
      ],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found).toHaveLength(1)
    expect(
      explainTarget(
        camera,
        personAt(0, 5),
        [
          {
            id: "agv-body",
            ownerId: "agv-1",
            min: { x: -1.2, y: 0, z: 0.4 },
            max: { x: 1.2, y: 2.2, z: 2.4 },
          },
        ],
        640,
        360,
        "agv-1",
      ).reason,
    ).toBe("VISIBLE")
  })

  it("ignores a volume that contains the camera itself", () => {
    const camera = agvCamera()
    const shell = [{ id: "shell", min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 3, z: 1 } }]
    expect(seePerson(camera, personAt(0, 4))).toHaveLength(1)
    const found = detectInView({
      camera,
      targets: [personAt(0, 4)],
      occluders: shell,
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(found).toHaveLength(1)
  })

  it("marks a partly covered person occluded and keeps that result stable", () => {
    const camera = agvCamera()
    const person = personAt(0.15, 8)
    const rack = [{ id: "rack-edge", min: { x: 0, y: 0, z: 3 }, max: { x: 2, y: 4, z: 4 } }]
    const reasons = Array.from({ length: 8 }, () =>
      explainTarget(camera, person, rack, 640, 360, "agv-1").reason,
    )
    expect(reasons.every((reason) => reason === reasons[0])).toBe(true)
    expect(reasons[0]).toBe("OCCLUDED")
    expect(
      detectInView({
        camera,
        targets: [person],
        occluders: rack,
        width: 640,
        height: 360,
        equipmentId: "agv-1",
      }),
    ).toHaveLength(0)
  })

  it("stays deterministic on both sides of the field-of-view edge", () => {
    const camera = agvCamera()
    const inside = personAt(1.5, 8)
    const outside = personAt(9, 4)
    const insideTicks = Array.from({ length: 8 }, () => seePerson(camera, inside).length)
    const outsideTicks = Array.from({ length: 8 }, () => seePerson(camera, outside).length)
    expect(insideTicks.every((count) => count === 1)).toBe(true)
    expect(outsideTicks.every((count) => count === 0)).toBe(true)
    expect(explainTarget(camera, outside, [], 640, 360).reason).toBe("OUTSIDE_FRUSTUM")
  })

  it("uses the camera transform from the current tick", () => {
    const camera = agvCamera()
    expect(seePerson(camera, personAt(0, 4))).toHaveLength(1)
    camera.position.z = 10
    camera.updateMatrixWorld(true)
    expect(seePerson(camera, personAt(0, 4))).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, 4), [], 640, 360).reason).toBe("BEHIND_CAMERA")
    camera.position.z = 0
    camera.rotation.y = Math.PI
    camera.updateMatrixWorld(true)
    expect(seePerson(camera, personAt(0, 4))[0]?.track_id).toBe("wrk-1")
  })

  it("keeps the same track id when one detection tick is missed", () => {
    const camera = agvCamera()
    const active = new Map<string, ViewDetection>()
    const missing = new Map<string, number>()
    const seen = seePerson(camera, personAt(0, 4))
    const first = stabilizeTracks(active, missing, seen)
    const held = stabilizeTracks(active, missing, [])
    expect(held).toHaveLength(1)
    expect(held[0]?.track_id).toBe(first[0]?.track_id)
    expect(held[0]?.id).toBe("agv-1:person:wrk-1")
    const again = stabilizeTracks(active, missing, seen)
    expect(again[0]?.track_id).toBe("wrk-1")
    expect(diffDetections(held, again).appeared).toHaveLength(0)
  })

  it("formats a person trace only as data, with a reject reason", () => {
    const camera = agvCamera()
    const visible = explainTarget(camera, personAt(0, 4), [], 640, 360, "agv-1")
    const behind = explainTarget(camera, personAt(0, -3), [], 640, 360, "agv-1")
    const snapshot = (person: typeof visible): CameraDebugSnapshot => ({
      position: { x: 0, y: 1.7, z: 0 },
      rotation: { x: 0, y: Math.PI, z: 0 },
      forward: { x: 0, y: 0, z: 1 },
      near: 0.12,
      far: 40,
      fov: 55,
      person,
    })
    expect(formatPersonDebug(snapshot(visible))).toContain("VISIBLE")
    expect(formatPersonDebug(snapshot(visible))).toContain("person=wrk-1")
    expect(formatPersonDebug(snapshot(behind))).toContain("REJECT: BEHIND_CAMERA")
    expect(behind.frustum).toBe(false)
  })

  it("ignores storage content and still sees the aisle", () => {
    const camera = cameraLookingForward()
    const stored = {
      ...pallet(6, "R01A-L1-C01"),
      sceneRole: "storage_content" as const,
    }
    const rack = {
      ...pallet(6, "R01A"),
      id: "rack:R01A",
      className: "rack",
      entityType: "rack",
      sceneRole: "storage_structure" as const,
    }
    const floor = {
      ...pallet(4, "floor-1"),
      sceneRole: "floor_object" as const,
      entityType: "floor",
    }
    const onPath = {
      ...pallet(5, "floor-path"),
      className: "obstacle",
      entityType: "floor",
      sceneRole: "floor_object" as const,
    }
    const person = personAt(0.4, 7)
    const forklift = {
      ...personAt(1.2, 8, "fl-1"),
      id: "device:fl-1",
      className: "forklift",
      entityType: "device",
      sceneRole: "dynamic_entity" as const,
    }
    const agv = {
      ...personAt(-1, 9, "agv-2"),
      id: "device:agv-2",
      className: "agv",
      entityType: "device",
      sceneRole: "dynamic_entity" as const,
    }
    const storedMany = Array.from({ length: 120 }, (_, index) => ({
      ...pallet(6, `R01A-L1-C${index}`),
      sceneRole: "storage_content" as const,
      position: { x: (index % 12) * 0.4 - 2, y: 1.2 + Math.floor(index / 12) * 0.3, z: 6 },
    }))
    const palletBox = {
      id: "inventory:R01A-L1-C01",
      min: { x: -0.5, y: 0.4, z: 3.2 },
      max: { x: 0.5, y: 1.8, z: 4.2 },
    }

    expect(isDetectionCandidate(stored)).toBe(false)
    expect(isDetectionCandidate(rack)).toBe(false)
    expect(isDetectionCandidate(floor)).toBe(true)
    expect(selectDetectionCandidates(storedMany)).toHaveLength(0)

    const found = detectInView({
      camera,
      targets: [stored, rack, floor, onPath, person, forklift, agv, ...storedMany],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    const classes = found.map((item) => item.class_name).sort()
    expect(classes).toEqual(["agv", "forklift", "obstacle", "pallet", "person"])
    expect(found.some((item) => item.entity_id.startsWith("R01A"))).toBe(false)
    expect(holdReason(found.filter((item) => item.class_name === "obstacle"))).toBe("obstacle")
    expect(holdReason(found.filter((item) => item.class_name === "pallet"))).toBeNull()

    const behind = detectInView({
      camera,
      targets: [stored, personAt(0, 8)],
      occluders: [palletBox],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(behind).toHaveLength(0)
    expect(explainTarget(camera, personAt(0, 8), [palletBox], 640, 360).reason).toBe("OCCLUDED")

    const crowded = detectInView({
      camera,
      targets: [...storedMany, person],
      occluders: [],
      width: 640,
      height: 360,
      equipmentId: "agv-1",
    })
    expect(crowded.map((item) => item.class_name)).toEqual(["person"])
    expect(diffDetections([], crowded).appeared.map((item) => item.class_name)).toEqual(["person"])
    expect(diffDetections([], crowded).appeared.some((item) => item.class_name === "pallet")).toBe(false)
  })
})
