import { Text } from "@react-three/drei"
import { memo, useMemo } from "react"
import { GEOM, MAT } from "@/components/warehouse3d/PalletRackVisuals.tsx"
import {
  buildSelectiveRackParts,
  type RackPartXform,
} from "@/components/warehouse3d/palletRackLayout.ts"
import { InstancedXforms } from "@/components/warehouse3d/twin/InstancedXforms.tsx"
import { getFloorPlanRacks } from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import { useWarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

function worldShift(
  item: RackPartXform,
  baseX: number,
  baseZ: number,
): RackPartXform {
  return {
    position: [
      item.position[0] + baseX,
      item.position[1],
      item.position[2] + baseZ,
    ],
    rotation: item.rotation,
    scale: item.scale,
  }
}

export const RackSystem = memo(function RackSystem() {
  const geom = useWarehouseGeometry()
  const racks = getFloorPlanRacks()
  const packed = useMemo(() => {
    const uprights: RackPartXform[] = []
    const basePlates: RackPartXform[] = []
    const beams: RackPartXform[] = []
    const depthBeams: RackPartXform[] = []
    const diagonals: RackPartXform[] = []
    const palletStops: RackPartXform[] = []
    const connectors: RackPartXform[] = []
    const guards: RackPartXform[] = []
    const guardFeet: RackPartXform[] = []
    const guardStripes: RackPartXform[] = []
    const wires: RackPartXform[] = []
    const meshWires: Array<{
      position: [number, number, number]
      scale: [number, number, number]
    }> = []
    const labels: Array<{
      code: string
      position: [number, number, number]
      rotY: number
      zSign: number
    }> = []

    for (let rackIndex = 0; rackIndex < racks.length; rackIndex += 1) {
      const rack = racks[rackIndex]
      if (!rack) continue
      const aisleSign: 1 | -1 = rack.side === "B" ? 1 : -1
      const baseX = geom.getRackBaseX(rackIndex)
      const baseZ = geom.getRowZ(rackIndex)
      const parts = buildSelectiveRackParts({
        rackLength: geom.rackLength,
        rackDepth: geom.rackDepth,
        bayCount: geom.cellsLength,
        levels: geom.levels,
        levelHeight: geom.levelHeight,
        aisleSign,
      })
      const lift = (list: RackPartXform[]) =>
        list.map((item) => worldShift(item, baseX, baseZ))
      uprights.push(...lift(parts.uprights))
      basePlates.push(...lift(parts.basePlates))
      beams.push(...lift(parts.beams))
      depthBeams.push(...lift(parts.depthBeams))
      diagonals.push(...lift(parts.diagonals))
      palletStops.push(...lift(parts.palletStops))
      connectors.push(...lift(parts.connectors))
      const meshZ = parts.backZ - aisleSign * 0.01
      meshWires.push({
        position: [baseX, parts.rackH / 2, baseZ + meshZ],
        scale: [geom.rackLength * 0.98, parts.rackH * 0.92, 1],
      })
      for (const x of parts.xs.filter((_, i) => i % 2 === 0)) {
        wires.push({
          position: [baseX + x, parts.rackH / 2, baseZ + meshZ],
          scale: [0.018, parts.rackH * 0.9, 0.018],
        })
      }
      for (const x of [-geom.rackLength / 2, geom.rackLength / 2]) {
        const gx = baseX + x
        const gz = baseZ + parts.aisleZ + aisleSign * 0.12
        guardFeet.push({ position: [gx, 0.016, gz] })
        guards.push({ position: [gx, 0.24, gz] })
        guardStripes.push({
          position: [gx, 0.24, gz],
          scale: [1.05, 0.18, 1.05],
        })
      }
      labels.push({
        code: rack.code,
        position: [
          baseX + (-geom.rackLength / 2 + 0.42),
          1.55,
          baseZ + parts.aisleZ + aisleSign * 0.06,
        ],
        rotY: aisleSign > 0 ? 0 : Math.PI,
        zSign: aisleSign,
      })
    }

    return {
      uprights,
      basePlates,
      beams,
      depthBeams,
      diagonals,
      palletStops,
      connectors,
      guards,
      guardFeet,
      guardStripes,
      wires,
      meshWires,
      labels,
    }
  }, [geom, racks])

  return (
    <group>
      <InstancedXforms
        geometry={GEOM.upright}
        material={MAT.upright}
        items={packed.uprights}
        limit={Math.max(1, packed.uprights.length)}
      />
      <InstancedXforms
        geometry={GEOM.plate}
        material={MAT.plate}
        items={packed.basePlates}
        limit={Math.max(1, packed.basePlates.length)}
      />
      <InstancedXforms
        geometry={GEOM.beam}
        material={MAT.beam}
        items={packed.beams}
        limit={Math.max(1, packed.beams.length)}
      />
      <InstancedXforms
        geometry={GEOM.depthBeam}
        material={MAT.brace}
        items={packed.depthBeams}
        limit={Math.max(1, packed.depthBeams.length)}
      />
      <InstancedXforms
        geometry={GEOM.diagonal}
        material={MAT.brace}
        items={packed.diagonals}
        limit={Math.max(1, packed.diagonals.length)}
      />
      <InstancedXforms
        geometry={GEOM.stop}
        material={MAT.plate}
        items={packed.palletStops}
        limit={Math.max(1, packed.palletStops.length)}
      />
      <InstancedXforms
        geometry={GEOM.clip}
        material={MAT.beam}
        items={packed.connectors}
        limit={Math.max(1, packed.connectors.length)}
      />
      <InstancedXforms
        geometry={GEOM.guardFoot}
        material={MAT.guard}
        items={packed.guardFeet}
        limit={Math.max(1, packed.guardFeet.length)}
      />
      <InstancedXforms
        geometry={GEOM.guardPost}
        material={MAT.guard}
        items={packed.guards}
        limit={Math.max(1, packed.guards.length)}
      />
      <InstancedXforms
        geometry={GEOM.guardPost}
        material={MAT.guardStripe}
        items={packed.guardStripes}
        limit={Math.max(1, packed.guardStripes.length)}
      />
      <InstancedXforms
        geometry={GEOM.box}
        material={MAT.brace}
        items={packed.wires}
        limit={Math.max(1, packed.wires.length)}
      />
      {packed.meshWires.map((wire) => (
        <mesh
          key={wire.position.join(",")}
          geometry={GEOM.meshWire}
          material={MAT.mesh}
          position={wire.position}
          scale={wire.scale}
        />
      ))}
      {packed.labels.map((label) => (
        <group key={label.code} position={label.position}>
          <mesh
            geometry={GEOM.box}
            material={MAT.label}
            scale={[0.72, 0.28, 0.02]}
          />
          <Text
            position={[0, 0.03, label.zSign * 0.018]}
            rotation={[0, label.rotY, 0]}
            fontSize={0.13}
            color="#f8fafc"
            anchorX="center"
            anchorY="middle"
          >
            {label.code}
          </Text>
        </group>
      ))}
    </group>
  )
})
