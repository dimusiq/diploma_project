/**
 * Визуальные примитивы selective pallet rack: каркас, паллета, индикатор статуса.
 * Геометрия склада и занятость приходят снаружи — здесь только меши.
 */
import { Instance, Instances, Text } from "@react-three/drei"
import { useMemo } from "react"
import {
  BoxGeometry,
  MeshStandardMaterial,
} from "three"
import {
  buildSelectiveRackParts,
  type PalletCargoVariant,
  type RackPartXform,
} from "@/components/warehouse3d/palletRackLayout.ts"
import type { CellStripe } from "@/components/warehouse3d/twin3dDerived.ts"
import {
  CELL_BLOCKED_COLOR,
  CELL_EXPIRED_COLOR,
  CELL_EXPIRING_COLOR,
  CELL_QUARANTINE_COLOR,
  CELL_RESERVED_COLOR,
  CELL_SELECTED_COLOR,
} from "@/components/warehouse3d/warehouse3dColors.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"

export const GEOM = {
  upright: new BoxGeometry(0.1, 1, 0.075),
  beam: new BoxGeometry(1, 0.1, 0.055),
  depthBeam: new BoxGeometry(0.045, 0.04, 1),
  diagonal: new BoxGeometry(0.032, 0.032, 1),
  plate: new BoxGeometry(0.2, 0.022, 0.16),
  stop: new BoxGeometry(0.42, 0.05, 0.03),
  clip: new BoxGeometry(0.04, 0.045, 0.02),
  slat: new BoxGeometry(1, 0.022, 0.1),
  stringer: new BoxGeometry(0.085, 0.09, 1),
  box: new BoxGeometry(1, 1, 1),
  guardPost: new BoxGeometry(0.09, 0.42, 0.09),
  guardFoot: new BoxGeometry(0.16, 0.03, 0.16),
  meshWire: new BoxGeometry(1, 1, 0.012),
}

export const MAT = {
  upright: new MeshStandardMaterial({
    color: "#4b5563",
    metalness: 0.72,
    roughness: 0.34,
  }),
  beam: new MeshStandardMaterial({
    color: "#c2410c",
    metalness: 0.58,
    roughness: 0.4,
  }),
  brace: new MeshStandardMaterial({
    color: "#64748b",
    metalness: 0.65,
    roughness: 0.38,
  }),
  plate: new MeshStandardMaterial({
    color: "#334155",
    metalness: 0.7,
    roughness: 0.42,
  }),
  guard: new MeshStandardMaterial({
    color: "#eab308",
    metalness: 0.28,
    roughness: 0.52,
  }),
  guardStripe: new MeshStandardMaterial({
    color: "#1c1917",
    metalness: 0.12,
    roughness: 0.78,
  }),
  mesh: new MeshStandardMaterial({
    color: "#94a3b8",
    metalness: 0.55,
    roughness: 0.45,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  }),
  wood: new MeshStandardMaterial({
    color: "#b45309",
    metalness: 0.04,
    roughness: 0.86,
  }),
  woodDark: new MeshStandardMaterial({
    color: "#78350f",
    metalness: 0.04,
    roughness: 0.9,
  }),
  cardboard0: new MeshStandardMaterial({
    color: "#c4a574",
    metalness: 0.02,
    roughness: 0.82,
  }),
  cardboard1: new MeshStandardMaterial({
    color: "#a67c52",
    metalness: 0.02,
    roughness: 0.84,
  }),
  cardboard2: new MeshStandardMaterial({
    color: "#d2b48c",
    metalness: 0.02,
    roughness: 0.8,
  }),
  label: new MeshStandardMaterial({
    color: "#1e3a5f",
    metalness: 0.25,
    roughness: 0.55,
  }),
}

export const CARDBOARD = [MAT.cardboard0, MAT.cardboard1, MAT.cardboard2] as const

function InstancedParts({
  geometry,
  material,
  items,
}: {
  geometry: BoxGeometry
  material: MeshStandardMaterial
  items: RackPartXform[]
}) {
  if (items.length === 0) return null
  return (
    <Instances
      limit={items.length}
      range={items.length}
      geometry={geometry}
      material={material}
      frustumCulled
    >
      {items.map((item, index) => (
        <Instance
          key={index}
          position={item.position}
          rotation={item.rotation ?? [0, 0, 0]}
          scale={item.scale ?? [1, 1, 1]}
        />
      ))}
    </Instances>
  )
}

export function Pallet({
  width,
  depth,
  height = 0.145,
}: {
  width: number
  depth: number
  height?: number
}) {
  const slats = useMemo(() => {
    const n = 5
    const out: number[] = []
    const span = depth - 0.08
    for (let i = 0; i < n; i += 1) {
      out.push(-span / 2 + (i / (n - 1)) * span)
    }
    return out
  }, [depth])

  return (
    <group>
      {[-width * 0.42, 0, width * 0.42].map((x) => (
        <mesh
          key={`s-${x}`}
          geometry={GEOM.stringer}
          material={MAT.woodDark}
          position={[x, height * 0.38, 0]}
          scale={[1, 1, depth]}
        />
      ))}
      {slats.map((z) => (
        <mesh
          key={`t-${z}`}
          geometry={GEOM.slat}
          material={MAT.wood}
          position={[0, height - 0.01, z]}
          scale={[width, 1, 1]}
        />
      ))}
    </group>
  )
}

export function Cargo({
  boxes,
  material,
}: {
  boxes: Array<{ x: number; y: number; z: number; w: number; h: number; d: number }>
  material: MeshStandardMaterial
}) {
  return (
    <group>
      {boxes.map((box, i) => (
        <mesh
          key={`b-${i}`}
          geometry={GEOM.box}
          material={material}
          position={[box.x, box.y, box.z]}
          scale={[box.w, box.h, box.d]}
        />
      ))}
    </group>
  )
}

export function PalletLoad({
  variant,
  maxHeight,
  lanes = 1,
}: {
  variant: PalletCargoVariant
  maxHeight: number
  lanes?: number
}) {
  const palletW = 1.2 * variant.widthScale
  const palletD = 0.8 * variant.depthScale
  const palletH = 0.145
  const cargoH = Math.min(
    0.62 * variant.heightScale,
    Math.max(0.28, maxHeight - palletH - 0.12),
  )
  const cardboard = CARDBOARD[variant.palette]

  const boxes = useMemo(() => {
    const w = palletW * 0.92
    const d = palletD * 0.9
    if (variant.boxCount === 2) {
      return [
        { x: -w * 0.26, z: 0, w: w * 0.46, d, h: cargoH, y: palletH + cargoH / 2 },
        {
          x: w * 0.26,
          z: 0,
          w: w * 0.46,
          d: d * 0.92,
          h: cargoH * 0.88,
          y: palletH + (cargoH * 0.88) / 2,
        },
      ]
    }
    if (variant.boxCount === 4) {
      return [
        {
          x: -w * 0.25,
          z: -d * 0.22,
          w: w * 0.46,
          d: d * 0.44,
          h: cargoH * 0.7,
          y: palletH + (cargoH * 0.7) / 2,
        },
        {
          x: w * 0.25,
          z: -d * 0.22,
          w: w * 0.44,
          d: d * 0.44,
          h: cargoH * 0.64,
          y: palletH + (cargoH * 0.64) / 2,
        },
        {
          x: -w * 0.25,
          z: d * 0.22,
          w: w * 0.46,
          d: d * 0.42,
          h: cargoH * 0.72,
          y: palletH + (cargoH * 0.72) / 2,
        },
        {
          x: w * 0.25,
          z: d * 0.22,
          w: w * 0.44,
          d: d * 0.42,
          h: cargoH * 0.58,
          y: palletH + (cargoH * 0.58) / 2,
        },
      ]
    }
    return [
      {
        x: -w * 0.25,
        z: 0,
        w: w * 0.46,
        d: d * 0.94,
        h: cargoH * 0.55,
        y: palletH + (cargoH * 0.55) / 2,
      },
      {
        x: w * 0.25,
        z: 0,
        w: w * 0.46,
        d: d * 0.9,
        h: cargoH * 0.55,
        y: palletH + (cargoH * 0.55) / 2,
      },
      {
        x: 0,
        z: 0,
        w: w * 0.7,
        d: d * 0.62,
        h: cargoH * 0.38,
        y: palletH + cargoH * 0.55 + (cargoH * 0.38) / 2,
      },
    ]
  }, [variant.boxCount, palletW, palletD, cargoH])

  const offsets = lanes >= 2 ? [-0.66, 0.66] : [0]
  return (
    <group>
      {offsets.map((ox) => (
        <group key={ox} position={[ox, 0, 0]}>
          <Pallet width={palletW} depth={palletD} height={palletH} />
          <Cargo boxes={boxes} material={cardboard} />
        </group>
      ))}
    </group>
  )
}

export function CellStatusMark({
  stripe,
  selected,
  hover,
  expiring,
  expired,
  heatIntensity,
  aisleSign,
  cellW,
  cellH,
  cellD,
}: {
  stripe?: CellStripe | null
  selected?: boolean
  hover?: boolean
  expiring?: boolean
  expired?: boolean
  heatIntensity?: number
  aisleSign: number
  cellW: number
  cellH: number
  cellD: number
}) {
  const heat = heatIntensity ?? 0
  const color = expired
    ? CELL_EXPIRED_COLOR
    : expiring
      ? CELL_EXPIRING_COLOR
      : stripe === "blocked"
        ? CELL_BLOCKED_COLOR
        : stripe === "reserved"
          ? CELL_RESERVED_COLOR
          : stripe === "quarantine"
            ? CELL_QUARANTINE_COLOR
            : selected
              ? CELL_SELECTED_COLOR
              : hover
                ? "#93c5fd"
                : heat > 0.35
                  ? "#ea580c"
                  : null
  const showVolume = Boolean(selected || hover || stripe || expiring || expired)
  if (!color && !showVolume) return null
  const z = aisleSign * (cellD / 2 - 0.04)
  return (
    <group>
      {showVolume && (
        <mesh position={[0, 0, 0]}>
          <boxGeometry args={[cellW * 0.98, cellH * 0.96, cellD * 0.96]} />
          <meshStandardMaterial
            color={selected ? CELL_SELECTED_COLOR : color ?? "#93c5fd"}
            transparent
            opacity={selected ? 0.12 : hover ? 0.07 : 0.05}
            metalness={0.1}
            roughness={0.6}
            depthWrite={false}
          />
        </mesh>
      )}
      {color && (
        <mesh position={[0, cellH / 2 - 0.06, z]}>
          <boxGeometry args={[0.16, 0.045, 0.03]} />
          <meshStandardMaterial
            color={color}
            emissive={color}
            emissiveIntensity={expired || expiring ? 0.45 : 0.22}
            metalness={0.2}
            roughness={0.45}
          />
        </mesh>
      )}
    </group>
  )
}

export function PalletRackFrame({
  geom,
  aisleSign,
  code,
  fillRatio,
  darkMode,
}: {
  geom: WarehouseGeometry
  aisleSign: 1 | -1
  code: string
  fillRatio?: number
  darkMode?: boolean
}) {
  const parts = useMemo(
    () =>
      buildSelectiveRackParts({
        rackLength: geom.rackLength,
        rackDepth: geom.rackDepth,
        bayCount: geom.cellsLength,
        levels: geom.levels,
        levelHeight: geom.levelHeight,
        aisleSign,
      }),
    [
      geom.rackLength,
      geom.rackDepth,
      geom.cellsLength,
      geom.levels,
      geom.levelHeight,
      aisleSign,
    ],
  )
  const labelZ = parts.aisleZ + aisleSign * 0.06
  const labelX = -geom.rackLength / 2 + 0.42
  const meshZ = parts.backZ - aisleSign * 0.01

  return (
    <group>
      <InstancedParts
        geometry={GEOM.upright}
        material={MAT.upright}
        items={parts.uprights}
      />
      <InstancedParts
        geometry={GEOM.plate}
        material={MAT.plate}
        items={parts.basePlates}
      />
      <InstancedParts
        geometry={GEOM.beam}
        material={MAT.beam}
        items={parts.beams}
      />
      <InstancedParts
        geometry={GEOM.depthBeam}
        material={MAT.brace}
        items={parts.depthBeams}
      />
      <InstancedParts
        geometry={GEOM.diagonal}
        material={MAT.brace}
        items={parts.diagonals}
      />
      <InstancedParts
        geometry={GEOM.stop}
        material={MAT.plate}
        items={parts.palletStops}
      />
      <InstancedParts
        geometry={GEOM.clip}
        material={MAT.beam}
        items={parts.connectors}
      />
      <mesh
        position={[0, parts.rackH / 2, meshZ]}
        geometry={GEOM.meshWire}
        material={MAT.mesh}
        scale={[geom.rackLength * 0.98, parts.rackH * 0.92, 1]}
      />
      {parts.xs
        .filter((_, i) => i % 2 === 0)
        .map((x) => (
          <mesh
            key={`wire-${x}`}
            position={[x, parts.rackH / 2, meshZ]}
            material={MAT.brace}
          >
            <boxGeometry args={[0.018, parts.rackH * 0.9, 0.018]} />
          </mesh>
        ))}
      {[-geom.rackLength / 2, geom.rackLength / 2].map((x) => (
        <group key={`guard-${x}`} position={[x, 0, parts.aisleZ + aisleSign * 0.12]}>
          <mesh
            geometry={GEOM.guardFoot}
            material={MAT.guard}
            position={[0, 0.016, 0]}
          />
          <mesh
            geometry={GEOM.guardPost}
            material={MAT.guard}
            position={[0, 0.24, 0]}
          />
          <mesh
            geometry={GEOM.guardPost}
            material={MAT.guardStripe}
            position={[0, 0.24, 0]}
            scale={[1.05, 0.18, 1.05]}
          />
        </group>
      ))}
      <group position={[labelX, 1.55, labelZ]}>
        <mesh material={MAT.label}>
          <boxGeometry args={[0.72, 0.28, 0.02]} />
        </mesh>
        <Text
          position={[0, 0.03, aisleSign * 0.018]}
          rotation={[0, aisleSign > 0 ? 0 : Math.PI, 0]}
          fontSize={0.13}
          color="#f8fafc"
          anchorX="center"
          anchorY="middle"
        >
          {code}
        </Text>
        {fillRatio != null && (
          <mesh position={[-(0.55 * (1 - Math.max(0.04, fillRatio))) / 2, -0.1, aisleSign * 0.014]}>
            <boxGeometry args={[0.55 * Math.max(0.04, fillRatio), 0.035, 0.01]} />
            <meshStandardMaterial
              color={darkMode ? "#4ade80" : "#16a34a"}
              roughness={0.5}
              metalness={0.1}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}
