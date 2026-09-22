import { useFrame } from "@react-three/fiber"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { setSceneFixtures } from "@/components/digitalTwin/agvCameraBridge.ts"
import type { SceneOccluder, SceneTarget } from "@/components/digitalTwin/sceneDetection.ts"
import {
  type Group,
  type InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Sphere,
  Vector3,
} from "three"
import { occupiedCellKeysFromIds } from "@/components/deviceServer/twinOccupancy.ts"
import { useSimData } from "@/components/deviceServer/useDeviceSimulation.ts"
import { CARDBOARD, GEOM, MAT } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import { InstancedXforms } from "@/components/warehouse3d/twin/InstancedXforms.tsx"
import {
  buildOccupancyInstances,
  MAX_BOXES,
  MAX_SLATS,
  MAX_STRINGERS,
  occupancyKeySignature,
  TWIN_CELL_COUNT,
} from "@/components/warehouse3d/twin/occupancyInstances.ts"
import { CELL_SELECTED_COLOR } from "@/components/warehouse3d/warehouse3dColors.ts"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import { getFloorPlanRacks } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { useWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

const dummy = new Object3D()
const HITBOX_MAT = new MeshBasicMaterial({
  color: "#000000",
  transparent: true,
  opacity: 0,
  depthWrite: false,
})
const BOUNDS = new Sphere(new Vector3(0, 2, 0), 90)
const SELECT_MAT = new MeshBasicMaterial({
  color: CELL_SELECTED_COLOR,
  transparent: true,
  opacity: 0.14,
  depthWrite: false,
})

export function OccupancySystem({
  selectedCell,
  onSelectCell,
}: {
  selectedCell: CellInfo | null
  onSelectCell: (info: CellInfo | null) => void
}) {
  const data = useSimData()
  const geom = useWarehouseGeometry()
  const occupancySig = occupancyKeySignature(data.occupiedCellIds)
  const packed = useMemo(
    () =>
      buildOccupancyInstances(
        occupiedCellKeysFromIds(data.occupiedCellIds),
        geom,
      ),
    [geom, occupancySig],
  )
  useEffect(() => {
    const racks = getFloorPlanRacks()
    const fixtures: SceneTarget[] = []
    const blockers: SceneOccluder[] = []
    for (let index = 0; index < packed.cells.length; index += 1) {
      const cell = packed.cells[index]
      const hit = packed.hitboxes[index]
      if (!cell?.filled || !hit) continue
      const code = racks[cell.row]?.code ?? `R${String(cell.row + 1).padStart(2, "0")}`
      const entityId = `${code}-L${cell.level + 1}-C${String(cell.cellX + 1).padStart(2, "0")}`
      fixtures.push({
        id: `inventory:${entityId}`,
        className: "pallet",
        entityType: "inventory",
        entityId,
        position: { x: hit.position[0], y: hit.position[1], z: hit.position[2] },
        half: {
          x: (hit.scale?.[0] ?? 0.8) / 2,
          y: (hit.scale?.[1] ?? 1) / 2,
          z: (hit.scale?.[2] ?? 0.8) / 2,
        },
      })
    }
    for (let row = 0; row < geom.rackRows; row += 1) {
      const code = racks[row]?.code ?? `rack-${row}`
      const cx = geom.getRackBaseX(row)
      const cz = geom.getRowZ(row)
      const hx = geom.rackLength / 2
      const hz = geom.rackDepth / 2
      const hy = geom.levels * geom.levelHeight
      blockers.push({
        id: `rack-box-${row}`,
        min: { x: cx - hx, y: 0, z: cz - hz },
        max: { x: cx + hx, y: hy, z: cz + hz },
      })
      fixtures.push({
        id: `rack:${code}`,
        className: "rack",
        entityType: "rack",
        entityId: code,
        position: { x: cx, y: hy / 2, z: cz },
        half: { x: hx, y: hy / 2, z: hz },
      })
    }
    setSceneFixtures({ pallets: fixtures, occluders: blockers })
  }, [geom, packed])

  const hitbox = useRef<InstancedMesh>(null)
  const cargoGroup = useRef<Group>(null)
  const pointerDown = useRef<{ x: number; y: number } | null>(null)

  useLayoutEffect(() => {
    const node = hitbox.current
    if (!node) return
    const n = Math.min(packed.hitboxes.length, TWIN_CELL_COUNT)
    for (let i = 0; i < n; i += 1) {
      const item = packed.hitboxes[i]
      if (!item) continue
      dummy.position.set(
        item.position[0],
        item.position[1],
        item.position[2],
      )
      dummy.scale.set(
        item.scale?.[0] ?? 1,
        item.scale?.[1] ?? 1,
        item.scale?.[2] ?? 1,
      )
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      node.setMatrixAt(i, dummy.matrix)
    }
    node.count = n
    node.instanceMatrix.needsUpdate = true
    node.boundingSphere = BOUNDS
  }, [packed.hitboxes])

  useFrame(({ camera }) => {
    if (cargoGroup.current) {
      cargoGroup.current.visible = camera.position.y < 62
    }
  })

  const selectedPos =
    selectedCell != null
      ? geom.getCellWorldPosition(
          selectedCell.row,
          selectedCell.level,
          selectedCell.cellX,
          selectedCell.cellZ,
        )
      : null

  return (
    <group>
      <InstancedXforms
        geometry={GEOM.stringer}
        material={MAT.woodDark}
        items={packed.stringers}
        limit={MAX_STRINGERS}
      />
      <InstancedXforms
        geometry={GEOM.slat}
        material={MAT.wood}
        items={packed.slats}
        limit={MAX_SLATS}
      />
      <group ref={cargoGroup}>
        <InstancedXforms
          geometry={GEOM.box}
          material={CARDBOARD[0]}
          items={packed.boxes[0]}
          limit={MAX_BOXES}
        />
        <InstancedXforms
          geometry={GEOM.box}
          material={CARDBOARD[1]}
          items={packed.boxes[1]}
          limit={MAX_BOXES}
        />
        <InstancedXforms
          geometry={GEOM.box}
          material={CARDBOARD[2]}
          items={packed.boxes[2]}
          limit={MAX_BOXES}
        />
      </group>
      <instancedMesh
        ref={hitbox}
        args={[GEOM.box, HITBOX_MAT, TWIN_CELL_COUNT]}
        frustumCulled
        onPointerDown={(event) => {
          event.stopPropagation()
          pointerDown.current = { x: event.clientX, y: event.clientY }
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
          const start = pointerDown.current
          pointerDown.current = null
          if (!start) return
          const dx = event.clientX - start.x
          const dy = event.clientY - start.y
          if (dx * dx + dy * dy > 36) return
          const id = event.instanceId
          if (id == null) return
          const info = packed.cells[id]
          if (!info) return
          const same =
            selectedCell?.row === info.row &&
            selectedCell?.level === info.level &&
            selectedCell?.cellX === info.cellX &&
            selectedCell?.cellZ === info.cellZ
          onSelectCell(same ? null : info)
        }}
      />
      {selectedPos && (
        <mesh
          position={selectedPos}
          material={SELECT_MAT}
          geometry={GEOM.box}
          scale={[
            geom.cellSize * 0.9,
            geom.cellHeight * 0.96,
            Math.min(geom.cellDepth, geom.rackDepth * 0.72) * 0.96,
          ]}
        />
      )}
    </group>
  )
}
