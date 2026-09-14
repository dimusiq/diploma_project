/**
 * Складская техника: процедурные модели (без GLB).
 * GLB из public/models/ не грузим: KHR_materials_pbrSpecularGlossiness и THREE.Clock
 * в лоадере Three r18x дают предупреждения и лишнюю нагрузку на GPU.
 * Ось +Z — направление «вперёд» модели.
 */

import { useFrame } from "@react-three/fiber"
import { useRef } from "react"
import type { Mesh, MeshStandardMaterial } from "three"

export type WarehouseEquipmentKind =
  | "forklift"
  | "pallet_jack"
  | "reach_truck"
  | "electric_pallet_jack"
  | "order_picker"

export function equipmentTypeToKind(type: string): WarehouseEquipmentKind {
  switch (type) {
    case "richtrak":
      return "reach_truck"
    case "komplektovshchik":
      return "order_picker"
    case "elektrotelezhka":
      return "electric_pallet_jack"
    default:
      return "forklift"
  }
}

const EQUIPMENT_YELLOW = "#eab308"
const METAL = "#64748b"
const DARK_METAL = "#475569"
const TIRE = "#1e293b"
const RIM = "#94a3b8"
const JACK_YELLOW = "#ca8a04"
const CHROME = "#cbd5e1"
const SEAT_BLACK = "#0f172a"
const GLASS = "#93c5fd"
const HEADLIGHT = "#fef9c3"
const BEACON_AMBER = "#f59e0b"
const TAIL_RED = "#ef4444"

function Wheel({
  position,
  radius = 0.14,
  width = 0.1,
}: {
  position: [number, number, number]
  radius?: number
  width?: number
}) {
  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius, radius, width, 20]} />
        <meshStandardMaterial color={TIRE} metalness={0.05} roughness={0.92} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.5, radius * 0.5, width + 0.01, 12]} />
        <meshStandardMaterial color={RIM} metalness={0.7} roughness={0.25} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[radius * 0.15, radius * 0.15, width + 0.02, 6]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.6} roughness={0.3} />
      </mesh>
    </group>
  )
}

function WarningBeacon({ position }: { position: [number, number, number] }) {
  const ref = useRef<Mesh>(null)
  useFrame((state) => {
    if (!ref.current) return
    const mat = ref.current.material as MeshStandardMaterial
    mat.emissiveIntensity = 0.4 + 0.6 * Math.abs(Math.sin(state.clock.elapsedTime * 3))
  })
  return (
    <group position={position}>
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.03, 0.045, 0.03, 8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.4} roughness={0.6} />
      </mesh>
      <mesh ref={ref} position={[0, 0.035, 0]}>
        <cylinderGeometry args={[0.035, 0.04, 0.04, 10]} />
        <meshStandardMaterial
          color={BEACON_AMBER}
          emissive={BEACON_AMBER}
          emissiveIntensity={0.6}
          transparent
          opacity={0.85}
        />
      </mesh>
      <mesh position={[0, 0.06, 0]}>
        <cylinderGeometry args={[0.02, 0.035, 0.01, 8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.4} />
      </mesh>
    </group>
  )
}

function ForkliftBody() {
  return (
    <group>
      {/* Main chassis */}
      <mesh position={[0, 0.32, -0.12]}>
        <boxGeometry args={[0.92, 0.26, 0.65]} />
        <meshStandardMaterial color={EQUIPMENT_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Chassis bottom plate */}
      <mesh position={[0, 0.18, -0.05]}>
        <boxGeometry args={[0.88, 0.04, 0.8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* Engine hood (rear raised) */}
      <mesh position={[0, 0.52, -0.42]}>
        <boxGeometry args={[0.8, 0.14, 0.22]} />
        <meshStandardMaterial color={EQUIPMENT_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      {/* Engine vents (grille lines on hood) */}
      {[-0.15, 0, 0.15].map((x, i) => (
        <mesh key={`vent-${i}`} position={[x, 0.595, -0.42]}>
          <boxGeometry args={[0.08, 0.005, 0.18]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Counterweight (heavy rear block) */}
      <mesh position={[0, 0.36, -0.57]}>
        <boxGeometry args={[0.86, 0.34, 0.1]} />
        <meshStandardMaterial color={SEAT_BLACK} metalness={0.35} roughness={0.75} />
      </mesh>
      {/* Counterweight rounded bottom */}
      <mesh position={[0, 0.22, -0.56]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.86, 8]} />
        <meshStandardMaterial color={SEAT_BLACK} metalness={0.35} roughness={0.75} />
      </mesh>

      {/* Overhead guard - 4 posts */}
      {(
        [
          [-0.4, 0.72, -0.05],
          [0.4, 0.72, -0.05],
          [-0.4, 0.72, -0.52],
          [0.4, 0.72, -0.52],
        ] as [number, number, number][]
      ).map((pos, i) => (
        <mesh key={`guard-post-${i}`} position={pos}>
          <boxGeometry args={[0.04, 0.54, 0.04]} />
          <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {/* Overhead guard roof plate */}
      <mesh position={[0, 0.99, -0.28]}>
        <boxGeometry args={[0.88, 0.025, 0.55]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.35} />
      </mesh>
      {/* Guard roof cross ribs */}
      {[-0.2, 0.2].map((x, i) => (
        <mesh key={`rib-${i}`} position={[x, 0.99, -0.28]}>
          <boxGeometry args={[0.03, 0.035, 0.55]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.4} />
        </mesh>
      ))}

      {/* Cabin windshield (front) */}
      <mesh position={[0, 0.72, -0.04]}>
        <boxGeometry args={[0.76, 0.38, 0.015]} />
        <meshStandardMaterial
          color={GLASS}
          metalness={0.15}
          roughness={0.15}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Side glass panels */}
      {[-0.42, 0.42].map((x, i) => (
        <mesh key={`side-glass-${i}`} position={[x, 0.72, -0.28]}>
          <boxGeometry args={[0.015, 0.38, 0.44]} />
          <meshStandardMaterial
            color={GLASS}
            metalness={0.15}
            roughness={0.15}
            transparent
            opacity={0.2}
          />
        </mesh>
      ))}

      {/* Seat bottom */}
      <mesh position={[0, 0.5, -0.32]}>
        <boxGeometry args={[0.3, 0.06, 0.28]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
      </mesh>
      {/* Seat backrest */}
      <mesh position={[0, 0.65, -0.44]}>
        <boxGeometry args={[0.28, 0.24, 0.05]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
      </mesh>
      {/* Seat armrests */}
      {[-0.17, 0.17].map((x, i) => (
        <mesh key={`arm-${i}`} position={[x, 0.55, -0.32]}>
          <boxGeometry args={[0.03, 0.04, 0.2]} />
          <meshStandardMaterial color={DARK_METAL} roughness={0.7} />
        </mesh>
      ))}

      {/* Steering column */}
      <mesh position={[0, 0.58, -0.16]} rotation={[-0.45, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 0.22, 8]} />
        <meshStandardMaterial color={CHROME} metalness={0.65} roughness={0.25} />
      </mesh>
      {/* Steering wheel */}
      <mesh position={[0, 0.67, -0.1]} rotation={[-0.45, 0, 0]}>
        <torusGeometry args={[0.055, 0.01, 8, 18]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.85} />
      </mesh>
      {/* Dashboard panel */}
      <mesh position={[0, 0.5, -0.07]}>
        <boxGeometry args={[0.5, 0.1, 0.06]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.8} />
      </mesh>

      {/* ── Mast assembly ── */}
      {/* Left upright channel */}
      <mesh position={[-0.16, 0.62, 0.38]}>
        <boxGeometry args={[0.05, 1.05, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Right upright channel */}
      <mesh position={[0.16, 0.62, 0.38]}>
        <boxGeometry args={[0.05, 1.05, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Inner channels (nested mast) */}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={`inner-mast-${i}`} position={[x, 0.55, 0.38]}>
          <boxGeometry args={[0.03, 0.85, 0.03]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.55} roughness={0.35} />
        </mesh>
      ))}
      {/* Mast crossbar top */}
      <mesh position={[0, 1.14, 0.38]}>
        <boxGeometry args={[0.38, 0.04, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Mast crossbar middle */}
      <mesh position={[0, 0.5, 0.38]}>
        <boxGeometry args={[0.38, 0.035, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Mast tilt cylinder */}
      <mesh position={[0.2, 0.4, 0.2]} rotation={[0.15, 0, 0]}>
        <cylinderGeometry args={[0.02, 0.025, 0.35, 8]} />
        <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Lift chain guides */}
      {[-0.08, 0.08].map((x, i) => (
        <mesh key={`chain-${i}`} position={[x, 0.5, 0.4]}>
          <cylinderGeometry args={[0.006, 0.006, 0.7, 4]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Carriage plate */}
      <mesh position={[0, 0.22, 0.42]}>
        <boxGeometry args={[0.36, 0.18, 0.035]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>

      {/* ── Forks (L-shaped) ── */}
      {[-0.13, 0.13].map((x, i) => (
        <group key={`fork-${i}`}>
          {/* Horizontal blade */}
          <mesh position={[x, 0.1, 0.62]}>
            <boxGeometry args={[0.065, 0.03, 0.52]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Vertical heel */}
          <mesh position={[x, 0.19, 0.39]}>
            <boxGeometry args={[0.065, 0.15, 0.03]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Fork tip taper */}
          <mesh position={[x, 0.09, 0.89]}>
            <boxGeometry args={[0.06, 0.015, 0.04]} />
            <meshStandardMaterial color={METAL} metalness={0.65} roughness={0.25} />
          </mesh>
        </group>
      ))}

      {/* ── Wheels ── */}
      <Wheel position={[-0.44, 0.14, -0.4]} radius={0.14} width={0.1} />
      <Wheel position={[0.44, 0.14, -0.4]} radius={0.14} width={0.1} />
      <Wheel position={[-0.44, 0.14, 0.2]} radius={0.14} width={0.1} />
      <Wheel position={[0.44, 0.14, 0.2]} radius={0.14} width={0.1} />
      {/* Rear axle */}
      <mesh position={[0, 0.14, -0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.84, 6]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.5} />
      </mesh>
      {/* Front axle */}
      <mesh position={[0, 0.14, 0.2]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.84, 6]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* ── Lights ── */}
      {/* Headlights */}
      {[-0.28, 0.28].map((x, i) => (
        <group key={`headlight-${i}`} position={[x, 0.38, 0.33]}>
          <mesh>
            <cylinderGeometry args={[0.04, 0.035, 0.025, 10]} />
            <meshStandardMaterial color={CHROME} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.015]} rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.033, 10]} />
            <meshStandardMaterial
              color={HEADLIGHT}
              emissive={HEADLIGHT}
              emissiveIntensity={0.4}
            />
          </mesh>
        </group>
      ))}
      {/* Tail lights */}
      {[-0.35, 0.35].map((x, i) => (
        <mesh key={`tail-${i}`} position={[x, 0.38, -0.62]}>
          <boxGeometry args={[0.06, 0.04, 0.015]} />
          <meshStandardMaterial
            color={TAIL_RED}
            emissive={TAIL_RED}
            emissiveIntensity={0.3}
          />
        </mesh>
      ))}

      {/* Warning beacon on roof */}
      <WarningBeacon position={[0, 1.01, -0.28]} />

      {/* Exhaust pipe */}
      <mesh position={[0.42, 0.58, -0.42]}>
        <cylinderGeometry args={[0.022, 0.022, 0.3, 8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.45} roughness={0.55} />
      </mesh>
      {/* Exhaust cap */}
      <mesh position={[0.42, 0.74, -0.42]}>
        <cylinderGeometry args={[0.028, 0.022, 0.02, 8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.5} />
      </mesh>

      {/* Hydraulic lines (body to mast) */}
      {[-0.22, 0.22].map((x, i) => (
        <mesh key={`hose-${i}`} position={[x, 0.35, 0.15]}>
          <cylinderGeometry args={[0.008, 0.008, 0.4, 4]} />
          <meshStandardMaterial color={SEAT_BLACK} roughness={0.9} />
        </mesh>
      ))}
    </group>
  )
}

function PalletCargo() {
  return (
    <group position={[0, 0.28, 0.6]}>
      {/* Pallet base */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.52, 0.06, 0.4]} />
        <meshStandardMaterial color="#a16207" metalness={0.05} roughness={0.85} />
      </mesh>
      {/* Pallet stringers */}
      {[-0.18, 0, 0.18].map((x, i) => (
        <mesh key={i} position={[x, -0.04, 0]}>
          <boxGeometry args={[0.06, 0.02, 0.4]} />
          <meshStandardMaterial color="#92400e" metalness={0.05} roughness={0.9} />
        </mesh>
      ))}
      {/* Cargo box */}
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.48, 0.2, 0.36]} />
        <meshStandardMaterial color="#78350f" metalness={0.05} roughness={0.8} />
      </mesh>
      {/* Cargo shrink wrap band */}
      <mesh position={[0, 0.13, 0]}>
        <boxGeometry args={[0.49, 0.06, 0.37]} />
        <meshStandardMaterial
          color="#e5e7eb"
          metalness={0.1}
          roughness={0.4}
          transparent
          opacity={0.35}
        />
      </mesh>
    </group>
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
      {/* Main pump housing body */}
      <mesh position={[0, 0.17, -0.02]}>
        <boxGeometry args={[0.26, 0.1, 0.32]} />
        <meshStandardMaterial color={JACK_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Pump housing top cap */}
      <mesh position={[0, 0.225, -0.02]}>
        <boxGeometry args={[0.22, 0.02, 0.28]} />
        <meshStandardMaterial color={JACK_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Hydraulic pump cylinder */}
      <mesh position={[0, 0.2, -0.12]}>
        <cylinderGeometry args={[0.028, 0.028, 0.14, 10]} />
        <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Pump piston rod */}
      <mesh position={[0, 0.28, -0.12]}>
        <cylinderGeometry args={[0.012, 0.012, 0.06, 6]} />
        <meshStandardMaterial color={CHROME} metalness={0.8} roughness={0.15} />
      </mesh>

      {/* ── Forks ── */}
      {[-0.11, 0.11].map((x, i) => (
        <group key={`fork-${i}`}>
          {/* Fork bottom plate */}
          <mesh position={[x, 0.045, 0.38]}>
            <boxGeometry args={[0.065, 0.025, 0.72]} />
            <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Fork side wall */}
          <mesh position={[x, 0.1, 0.38]}>
            <boxGeometry args={[0.065, 0.08, 0.72]} />
            <meshStandardMaterial color={JACK_YELLOW} metalness={0.25} roughness={0.55} />
          </mesh>
          {/* Fork tip taper */}
          <mesh position={[x, 0.035, 0.77]}>
            <boxGeometry args={[0.06, 0.012, 0.06]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Load roller */}
          <mesh
            position={[x, 0.025, 0.66]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.025, 0.025, 0.05, 10]} />
            <meshStandardMaterial color={TIRE} roughness={0.88} />
          </mesh>
          {/* Secondary load roller */}
          <mesh
            position={[x, 0.025, 0.44]}
            rotation={[0, 0, Math.PI / 2]}
          >
            <cylinderGeometry args={[0.02, 0.02, 0.04, 8]} />
            <meshStandardMaterial color={TIRE} roughness={0.88} />
          </mesh>
        </group>
      ))}

      {/* Fork cross-member connecting both forks at pump end */}
      <mesh position={[0, 0.1, 0.02]}>
        <boxGeometry args={[0.28, 0.06, 0.06]} />
        <meshStandardMaterial color={JACK_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>

      {/* ── Handle assembly ── */}
      {/* Handle stem */}
      <mesh position={[0, 0.38, -0.26]} rotation={[0.32, 0, 0]}>
        <boxGeometry args={[0.035, 0.42, 0.035]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Handle pivot joint */}
      <mesh position={[0, 0.22, -0.16]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.025, 0.025, 0.06, 8]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* T-handle crossbar */}
      <mesh position={[0, 0.58, -0.38]}>
        <boxGeometry args={[0.26, 0.03, 0.03]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Handle grips (rubber) */}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={`grip-${i}`} position={[x, 0.58, -0.38]}>
          <cylinderGeometry args={[0.02, 0.02, 0.065, 10]} />
          <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
        </mesh>
      ))}

      {/* Release lever */}
      <mesh position={[0.06, 0.34, -0.22]} rotation={[0.2, 0, 0.1]}>
        <boxGeometry args={[0.015, 0.12, 0.012]} />
        <meshStandardMaterial color={TAIL_RED} roughness={0.7} />
      </mesh>
      {/* Release lever knob */}
      <mesh position={[0.06, 0.4, -0.2]}>
        <sphereGeometry args={[0.012, 6, 6]} />
        <meshStandardMaterial color={TAIL_RED} roughness={0.6} />
      </mesh>

      {/* ── Steer wheels ── */}
      {[-0.14, 0.14].map((x, i) => (
        <group key={`steer-${i}`} position={[x, 0.065, -0.2]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.065, 0.065, 0.04, 16]} />
            <meshStandardMaterial color={TIRE} roughness={0.92} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.03, 0.03, 0.045, 8]} />
            <meshStandardMaterial color={RIM} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Caster bracket */}
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[0.025, 0.05, 0.04]} />
            <meshStandardMaterial color={DARK_METAL} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Name plate / label area on pump housing */}
      <mesh position={[0, 0.18, 0.14]}>
        <boxGeometry args={[0.12, 0.04, 0.005]} />
        <meshStandardMaterial color="#fef08a" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}

export function ReachTruckModel() {
  return (
    <group>
      {/* Straddle base (wider low platform) */}
      <mesh position={[0, 0.08, 0.1]}>
        <boxGeometry args={[0.7, 0.12, 0.9]} />
        <meshStandardMaterial color={EQUIPMENT_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Straddle legs extending forward */}
      {[-0.28, 0.28].map((x, i) => (
        <group key={`leg-${i}`}>
          <mesh position={[x, 0.06, 0.65]}>
            <boxGeometry args={[0.1, 0.08, 0.55]} />
            <meshStandardMaterial color={EQUIPMENT_YELLOW} metalness={0.25} roughness={0.55} />
          </mesh>
          {/* Leg wheels */}
          <mesh position={[x, 0.035, 0.85]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.035, 0.035, 0.08, 10]} />
            <meshStandardMaterial color={TIRE} roughness={0.9} />
          </mesh>
        </group>
      ))}

      {/* Operator cabin tower */}
      <mesh position={[0, 0.55, -0.18]}>
        <boxGeometry args={[0.6, 0.82, 0.52]} />
        <meshStandardMaterial color={EQUIPMENT_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Cabin side panels (darker) */}
      {[-0.32, 0.32].map((x, i) => (
        <mesh key={`side-${i}`} position={[x, 0.55, -0.18]}>
          <boxGeometry args={[0.015, 0.75, 0.5]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {/* Front windshield */}
      <mesh position={[0, 0.7, 0.06]}>
        <boxGeometry args={[0.55, 0.5, 0.012]} />
        <meshStandardMaterial
          color={GLASS}
          metalness={0.15}
          roughness={0.15}
          transparent
          opacity={0.3}
        />
      </mesh>
      {/* Overhead guard */}
      <mesh position={[0, 0.98, -0.18]}>
        <boxGeometry args={[0.65, 0.03, 0.55]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.35} />
      </mesh>
      {/* Guard posts */}
      {[[-0.28, -0.42], [0.28, -0.42], [-0.28, 0.04], [0.28, 0.04]].map(
        ([x, z], i) => (
          <mesh key={`gp-${i}`} position={[x, 0.75, z]}>
            <boxGeometry args={[0.03, 0.5, 0.03]} />
            <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
          </mesh>
        ),
      )}

      {/* Tall mast assembly (reach trucks have taller masts) */}
      {[-0.15, 0.15].map((x, i) => (
        <group key={`mast-${i}`}>
          {/* Outer channel */}
          <mesh position={[x, 0.85, 0.55]}>
            <boxGeometry args={[0.05, 1.5, 0.05]} />
            <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
          </mesh>
          {/* Inner telescopic channel */}
          <mesh position={[x * 0.65, 0.75, 0.55]}>
            <boxGeometry args={[0.035, 1.2, 0.035]} />
            <meshStandardMaterial color={DARK_METAL} metalness={0.55} roughness={0.35} />
          </mesh>
        </group>
      ))}
      {/* Mast top crossbar */}
      <mesh position={[0, 1.6, 0.55]}>
        <boxGeometry args={[0.36, 0.04, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Mast mid crossbar */}
      <mesh position={[0, 0.7, 0.55]}>
        <boxGeometry args={[0.36, 0.035, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Reach cylinder */}
      <mesh position={[0, 0.25, 0.35]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.025, 0.025, 0.4, 8]} />
        <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.2} />
      </mesh>
      {/* Lift chains */}
      {[-0.07, 0.07].map((x, i) => (
        <mesh key={`chain-${i}`} position={[x, 0.75, 0.57]}>
          <cylinderGeometry args={[0.005, 0.005, 1.1, 4]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Carriage/backrest */}
      <mesh position={[0, 0.3, 0.58]}>
        <boxGeometry args={[0.34, 0.2, 0.03]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Forks */}
      {[-0.12, 0.12].map((x, i) => (
        <group key={`fork-${i}`}>
          <mesh position={[x, 0.12, 0.78]}>
            <boxGeometry args={[0.06, 0.025, 0.44]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[x, 0.2, 0.58]}>
            <boxGeometry args={[0.06, 0.13, 0.025]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Drive wheel (rear) */}
      <mesh position={[0, 0.08, -0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.15, 12]} />
        <meshStandardMaterial color={TIRE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, -0.4]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.16, 8]} />
        <meshStandardMaterial color={RIM} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Load wheels */}
      {[-0.25, 0.25].map((x, i) => (
        <mesh key={`lw-${i}`} position={[x, 0.04, 0.3]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.06, 10]} />
          <meshStandardMaterial color={TIRE} roughness={0.9} />
        </mesh>
      ))}

      {/* Steering tiller handle */}
      <mesh position={[0, 0.5, -0.42]} rotation={[-0.3, 0, 0]}>
        <cylinderGeometry args={[0.015, 0.015, 0.35, 6]} />
        <meshStandardMaterial color={CHROME} metalness={0.65} roughness={0.25} />
      </mesh>
      {/* Steering wheel */}
      <mesh position={[0, 0.67, -0.35]} rotation={[-0.3, 0, 0]}>
        <torusGeometry args={[0.05, 0.01, 8, 16]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.85} />
      </mesh>

      {/* Seat */}
      <mesh position={[0, 0.42, -0.28]}>
        <boxGeometry args={[0.28, 0.04, 0.25]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.55, -0.39]}>
        <boxGeometry args={[0.26, 0.2, 0.04]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
      </mesh>

      {/* Warning beacon */}
      <WarningBeacon position={[0, 1.0, -0.18]} />

      {/* Headlights */}
      {[-0.22, 0.22].map((x, i) => (
        <group key={`hl-${i}`} position={[x, 0.25, 0.1]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.03, 8]} />
            <meshStandardMaterial
              color={HEADLIGHT}
              emissive={HEADLIGHT}
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      ))}

      {/* Tail light */}
      <mesh position={[0, 0.35, -0.45]}>
        <boxGeometry args={[0.1, 0.04, 0.015]} />
        <meshStandardMaterial
          color={TAIL_RED}
          emissive={TAIL_RED}
          emissiveIntensity={0.25}
        />
      </mesh>
    </group>
  )
}

function ConveyorSection({
  length = 3,
  position,
  rotation,
}: {
  length?: number
  position?: [number, number, number]
  rotation?: [number, number, number]
}) {
  const rollerCount = Math.floor(length / 0.15)
  return (
    <group position={position} rotation={rotation}>
      {/* Side rails */}
      {[-0.25, 0.25].map((x, i) => (
        <group key={`rail-${i}`}>
          <mesh position={[x, 0.55, 0]}>
            <boxGeometry args={[0.04, 0.06, length]} />
            <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
          </mesh>
          {/* Rail supports (legs) */}
          {[-length / 2 + 0.2, 0, length / 2 - 0.2].map((z, li) => (
            <group key={li}>
              <mesh position={[x, 0.275, z]}>
                <boxGeometry args={[0.04, 0.55, 0.04]} />
                <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
              </mesh>
              <mesh position={[x, 0.01, z]}>
                <boxGeometry args={[0.1, 0.02, 0.1]} />
                <meshStandardMaterial color={METAL} metalness={0.45} roughness={0.5} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {/* Rollers */}
      {Array.from({ length: rollerCount }, (_, i) => {
        const z = -length / 2 + 0.1 + i * 0.15
        return (
          <mesh key={i} position={[0, 0.54, z]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.02, 0.02, 0.46, 8]} />
            <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.25} />
          </mesh>
        )
      })}
      {/* End plates */}
      {[-length / 2, length / 2].map((z, i) => (
        <mesh key={i} position={[0, 0.55, z]}>
          <boxGeometry args={[0.54, 0.08, 0.02]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.45} roughness={0.5} />
        </mesh>
      ))}
    </group>
  )
}

export function ElectricPalletJackModel() {
  const BODY_YELLOW = "#eab308"
  return (
    <group>
      {/* Main body / battery housing */}
      <mesh position={[0, 0.28, -0.1]}>
        <boxGeometry args={[0.4, 0.3, 0.45]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Battery compartment panel */}
      <mesh position={[0, 0.28, -0.33]}>
        <boxGeometry args={[0.38, 0.26, 0.02]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.35} roughness={0.6} />
      </mesh>
      {/* Top cover */}
      <mesh position={[0, 0.44, -0.1]}>
        <boxGeometry args={[0.42, 0.02, 0.47]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Control head / tiller */}
      <mesh position={[0, 0.5, -0.25]} rotation={[-0.25, 0, 0]}>
        <boxGeometry args={[0.2, 0.14, 0.12]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.35} roughness={0.6} />
      </mesh>
      {/* Handle bar */}
      <mesh position={[0, 0.6, -0.35]} rotation={[-0.35, 0, 0]}>
        <boxGeometry args={[0.35, 0.03, 0.03]} />
        <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Grips */}
      {[-0.15, 0.15].map((x, i) => (
        <mesh key={`grip-${i}`} position={[x, 0.6, -0.35]} rotation={[-0.35, 0, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 0.06, 8]} />
          <meshStandardMaterial color={SEAT_BLACK} roughness={0.95} />
        </mesh>
      ))}
      {/* Butterfly throttle buttons */}
      {[-0.08, 0.08].map((x, i) => (
        <mesh key={`btn-${i}`} position={[x, 0.56, -0.28]} rotation={[-0.25, 0, 0]}>
          <boxGeometry args={[0.04, 0.015, 0.08]} />
          <meshStandardMaterial color={BODY_YELLOW} metalness={0.2} roughness={0.5} />
        </mesh>
      ))}

      {/* Forks */}
      {[-0.12, 0.12].map((x, i) => (
        <group key={`fork-${i}`}>
          <mesh position={[x, 0.045, 0.42]}>
            <boxGeometry args={[0.07, 0.025, 0.8]} />
            <meshStandardMaterial color={METAL} metalness={0.5} roughness={0.4} />
          </mesh>
          <mesh position={[x, 0.1, 0.42]}>
            <boxGeometry args={[0.07, 0.085, 0.8]} />
            <meshStandardMaterial color={BODY_YELLOW} metalness={0.25} roughness={0.55} />
          </mesh>
          {/* Fork tip */}
          <mesh position={[x, 0.035, 0.85]}>
            <boxGeometry args={[0.065, 0.012, 0.06]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          {/* Load roller */}
          <mesh position={[x, 0.025, 0.72]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.025, 0.025, 0.055, 10]} />
            <meshStandardMaterial color={TIRE} roughness={0.9} />
          </mesh>
        </group>
      ))}
      {/* Fork cross-member */}
      <mesh position={[0, 0.1, 0.02]}>
        <boxGeometry args={[0.3, 0.08, 0.06]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>

      {/* Drive wheel (center rear) */}
      <mesh position={[0, 0.08, -0.32]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.12, 14]} />
        <meshStandardMaterial color={TIRE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, -0.32]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.04, 0.04, 0.13, 8]} />
        <meshStandardMaterial color={RIM} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Caster wheels */}
      {[-0.18, 0.18].map((x, i) => (
        <group key={`caster-${i}`} position={[x, 0.04, -0.1]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.04, 0.04, 0.04, 10]} />
            <meshStandardMaterial color={TIRE} roughness={0.9} />
          </mesh>
          <mesh position={[0, 0.035, 0]}>
            <boxGeometry args={[0.02, 0.04, 0.03]} />
            <meshStandardMaterial color={DARK_METAL} metalness={0.4} roughness={0.5} />
          </mesh>
        </group>
      ))}

      {/* Warning beacon */}
      <WarningBeacon position={[0, 0.46, -0.1]} />

      {/* Name plate */}
      <mesh position={[0, 0.28, 0.14]}>
        <boxGeometry args={[0.15, 0.05, 0.005]} />
        <meshStandardMaterial color="#fef08a" metalness={0.1} roughness={0.6} />
      </mesh>
    </group>
  )
}

export function OrderPickerModel() {
  const BODY_YELLOW = "#eab308"
  return (
    <group>
      {/* Base platform (wide, low) */}
      <mesh position={[0, 0.06, 0]}>
        <boxGeometry args={[0.7, 0.08, 0.6]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Platform non-slip tread */}
      <mesh position={[0, 0.105, 0]}>
        <boxGeometry args={[0.68, 0.005, 0.58]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.2} roughness={0.8} />
      </mesh>

      {/* Left mast */}
      {[-0.28, 0.28].map((x, i) => (
        <group key={`mast-${i}`}>
          <mesh position={[x, 1.0, 0.28]}>
            <boxGeometry args={[0.06, 1.8, 0.06]} />
            <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
          </mesh>
          <mesh position={[x * 0.7, 0.85, 0.28]}>
            <boxGeometry args={[0.04, 1.4, 0.04]} />
            <meshStandardMaterial color={DARK_METAL} metalness={0.55} roughness={0.35} />
          </mesh>
        </group>
      ))}
      {/* Mast top crossbar */}
      <mesh position={[0, 1.9, 0.28]}>
        <boxGeometry args={[0.62, 0.04, 0.06]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>
      {/* Mast mid crossbar */}
      <mesh position={[0, 0.8, 0.28]}>
        <boxGeometry args={[0.62, 0.035, 0.05]} />
        <meshStandardMaterial color={METAL} metalness={0.55} roughness={0.35} />
      </mesh>

      {/* Lift platform (operator platform that goes up) */}
      <mesh position={[0, 0.35, 0.05]}>
        <boxGeometry args={[0.55, 0.04, 0.45]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.25} roughness={0.55} />
      </mesh>
      {/* Platform guard rail */}
      {[-0.26, 0.26].map((x, i) => (
        <mesh key={`rail-${i}`} position={[x, 0.55, -0.1]}>
          <boxGeometry args={[0.025, 0.38, 0.35]} />
          <meshStandardMaterial color={BODY_YELLOW} metalness={0.2} roughness={0.6} transparent opacity={0.5} />
        </mesh>
      ))}
      {/* Gate chain (front) */}
      <mesh position={[0, 0.55, -0.17]}>
        <boxGeometry args={[0.5, 0.025, 0.015]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.48, -0.17]}>
        <boxGeometry args={[0.5, 0.025, 0.015]} />
        <meshStandardMaterial color={BODY_YELLOW} metalness={0.3} roughness={0.5} />
      </mesh>

      {/* Forks (below lift platform) */}
      {[-0.14, 0.14].map((x, i) => (
        <group key={`fork-${i}`}>
          <mesh position={[x, 0.1, 0.55]}>
            <boxGeometry args={[0.06, 0.025, 0.5]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
          <mesh position={[x, 0.18, 0.32]}>
            <boxGeometry args={[0.06, 0.12, 0.025]} />
            <meshStandardMaterial color={METAL} metalness={0.6} roughness={0.3} />
          </mesh>
        </group>
      ))}

      {/* Control console */}
      <mesh position={[0.22, 0.52, 0.05]} rotation={[0, -0.2, 0]}>
        <boxGeometry args={[0.12, 0.08, 0.15]} />
        <meshStandardMaterial color={DARK_METAL} metalness={0.35} roughness={0.6} />
      </mesh>
      {/* Joystick */}
      <mesh position={[0.22, 0.58, 0.05]}>
        <cylinderGeometry args={[0.008, 0.008, 0.08, 6]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.85} />
      </mesh>
      <mesh position={[0.22, 0.63, 0.05]}>
        <sphereGeometry args={[0.015, 6, 6]} />
        <meshStandardMaterial color={SEAT_BLACK} roughness={0.8} />
      </mesh>

      {/* Drive wheel */}
      <mesh position={[0, 0.06, -0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.06, 0.06, 0.15, 12]} />
        <meshStandardMaterial color={TIRE} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.06, -0.28]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 0.16, 8]} />
        <meshStandardMaterial color={RIM} metalness={0.6} roughness={0.3} />
      </mesh>
      {/* Front load wheels */}
      {[-0.3, 0.3].map((x, i) => (
        <mesh key={`fw-${i}`} position={[x, 0.04, 0.25]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.04, 0.04, 0.05, 10]} />
          <meshStandardMaterial color={TIRE} roughness={0.9} />
        </mesh>
      ))}

      {/* Lift chains */}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={`chain-${i}`} position={[x, 0.9, 0.3]}>
          <cylinderGeometry args={[0.005, 0.005, 1.3, 4]} />
          <meshStandardMaterial color={DARK_METAL} metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {/* Hydraulic cylinder */}
      <mesh position={[0, 0.6, 0.3]}>
        <cylinderGeometry args={[0.022, 0.028, 0.8, 8]} />
        <meshStandardMaterial color={CHROME} metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Warning beacon */}
      <WarningBeacon position={[0, 1.92, 0.28]} />

      {/* Headlights */}
      {[-0.3, 0.3].map((x, i) => (
        <group key={`hl-${i}`} position={[x, 0.15, 0.31]}>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.025, 8]} />
            <meshStandardMaterial
              color={HEADLIGHT}
              emissive={HEADLIGHT}
              emissiveIntensity={0.3}
            />
          </mesh>
        </group>
      ))}

      {/* Tail lights */}
      {[-0.3, 0.3].map((x, i) => (
        <mesh key={`tl-${i}`} position={[x, 0.15, -0.31]}>
          <boxGeometry args={[0.05, 0.035, 0.01]} />
          <meshStandardMaterial color={TAIL_RED} emissive={TAIL_RED} emissiveIntensity={0.25} />
        </mesh>
      ))}
    </group>
  )
}

export { ConveyorSection }

function ProceduralModel({
  kind,
  showPallet,
}: {
  kind: WarehouseEquipmentKind
  showPallet?: boolean
}) {
  switch (kind) {
    case "pallet_jack":
      return <PalletJackModel />
    case "reach_truck":
      return <ReachTruckModel />
    case "electric_pallet_jack":
      return <ElectricPalletJackModel />
    case "order_picker":
      return <OrderPickerModel />
    default:
      return <ForkliftWithLoad showPallet={showPallet} />
  }
}

export function WarehouseEquipmentMesh({
  kind,
  showPallet,
}: {
  kind: WarehouseEquipmentKind
  showPallet?: boolean
}) {
  return <ProceduralModel kind={kind} showPallet={showPallet} />
}
