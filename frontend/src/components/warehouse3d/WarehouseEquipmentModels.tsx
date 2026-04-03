/**
 * Процедурные модели складской техники (без внешних GLB).
 * Ось +Z — направление «вперёд» модели.
 */

export type WarehouseEquipmentKind = "forklift" | "pallet_jack"

const FORKLIFT_ORANGE = "#ea580c"
const METAL = "#64748b"
const TIRE = "#1e293b"
const JACK_GREEN = "#15803d"

function ForkliftBody() {
  return (
    <group>
      {/* кузов */}
      <mesh position={[0, 0.45, -0.15]}>
        <boxGeometry args={[0.95, 0.42, 0.62]} />
        <meshStandardMaterial
          color={FORKLIFT_ORANGE}
          metalness={0.25}
          roughness={0.55}
        />
      </mesh>
      {/* кабина */}
      <mesh position={[0, 0.78, -0.38]}>
        <boxGeometry args={[0.75, 0.38, 0.35]} />
        <meshStandardMaterial
          color="#93c5fd"
          metalness={0.15}
          roughness={0.25}
          transparent
          opacity={0.45}
        />
      </mesh>
      {/* мачта */}
      <mesh position={[0, 0.55, 0.42]}>
        <boxGeometry args={[0.12, 0.9, 0.08]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* вилы */}
      <mesh position={[-0.14, 0.12, 0.52]}>
        <boxGeometry args={[0.06, 0.04, 0.45]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0.14, 0.12, 0.52]}>
        <boxGeometry args={[0.06, 0.04, 0.45]} />
        <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.35} />
      </mesh>
      {/* колёса */}
      {[
        [-0.38, 0.12, -0.35],
        [0.38, 0.12, -0.35],
        [-0.38, 0.12, 0.28],
        [0.38, 0.12, 0.28],
      ].map((p, i) => (
        <mesh
          key={i}
          position={p as [number, number, number]}
          rotation={[0, 0, Math.PI / 2]}
        >
          <cylinderGeometry args={[0.14, 0.14, 0.1, 16]} />
          <meshStandardMaterial color={TIRE} metalness={0.1} roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function PalletCargo() {
  return (
    <mesh position={[0, 0.32, 0.52]}>
      <boxGeometry args={[0.55, 0.2, 0.42]} />
      <meshStandardMaterial color="#b45309" metalness={0.05} roughness={0.8} />
    </mesh>
  )
}

export function ForkliftWithLoad({ showPallet }: { showPallet?: boolean }) {
  return (
    <group>
      <ForkliftBody />
      {showPallet ? <PalletCargo /> : null}
    </group>
  )
}

export function PalletJackModel() {
  return (
    <group>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.35, 0.12, 0.85]} />
        <meshStandardMaterial
          color={JACK_GREEN}
          metalness={0.2}
          roughness={0.6}
        />
      </mesh>
      <mesh position={[0, 0.42, -0.32]} rotation={[0.35, 0, 0]}>
        <boxGeometry args={[0.06, 0.5, 0.06]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {[-0.12, 0.12].map((x, i) => (
        <mesh key={i} position={[x, 0.06, 0.48]}>
          <boxGeometry args={[0.04, 0.02, 0.35]} />
          <meshStandardMaterial
            color={METAL}
            metalness={0.55}
            roughness={0.35}
          />
        </mesh>
      ))}
      {[-0.2, 0.2].map((x, i) => (
        <mesh key={i} position={[x, 0.1, -0.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.08, 0.08, 0.06, 12]} />
          <meshStandardMaterial color={TIRE} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

export function WarehouseEquipmentMesh({
  kind,
  showPallet,
}: {
  kind: WarehouseEquipmentKind
  showPallet?: boolean
}) {
  if (kind === "pallet_jack") return <PalletJackModel />
  return <ForkliftWithLoad showPallet={showPallet} />
}
