/**
 * Warehouse digital twin: ряды / уровни / ячейки из layout API (дефолт = legacy 12×4×20×1).
 */

import {
  ContactShadows,
  Html,
  OrbitControls,
  Text,
  useProgress,
} from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MeshStandardMaterial } from 'three';
import type { RouteGraphResponse } from '@/api/warehouseRouteGraph.ts';
import type { TopologyDocument } from '@/api/warehouseTopology.ts';
import { useSimMotion } from '@/components/deviceServer/useDeviceSimulation.ts';
import { FloorPlanRackRow } from '@/components/warehouse3d/FloorPlanRackRow.tsx';
import { FloorPlanSceneLayers } from '@/components/warehouse3d/FloorPlanSceneLayers.tsx';
import type { CellStripe } from '@/components/warehouse3d/twin3dDerived.ts';
import {
  ConveyorSection,
  type WarehouseEquipmentKind,
} from '@/components/warehouse3d/WarehouseEquipmentModels.tsx';
import { FreeCameraController } from '@/components/warehouse3d/WarehouseFreeCamera.tsx';
import {
  ROUTE_FLOOR_Y,
  RoutePathLayer,
  SimulationEquipmentAlongRoute,
} from '@/components/warehouse3d/WarehouseRouteLayer.tsx';
import { StorageCell } from '@/components/warehouse3d/WarehouseStorageCell.tsx';
import {
  type TwinEquipmentMarker,
  type TwinLayersVisibility,
  WarehouseTwinLayers,
} from '@/components/warehouse3d/WarehouseTwinLayers.tsx';
import { cellMatchesFilter } from '@/components/warehouse3d/warehouse3dSearch.ts';
import type {
  CellInfo,
  TwinOverlayMode,
  WarehouseInteractionMode,
} from '@/components/warehouse3d/warehouse3dTypes.ts';
import { pickLaneWorldZ } from '@/components/warehouse3d/warehouseAisleRouting.ts';
import {
  getFloorPlanRacks,
  isFloorPlanLayoutSpec,
  resolveFloorPlanLayoutSpec,
} from '@/components/warehouse3d/warehouseFloorPlanAdapter.ts';
import {
  buildWarehouseGeometry,
  DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  useWarehouseGeometry,
  type WarehouseGeometry,
  WarehouseGeometryProvider,
  type WarehouseLayoutSpec,
} from '@/components/warehouse3d/warehouseGeometry.tsx';
import { buildRoutePolyline } from '@/components/warehouse3d/warehouseRouteGraphPath.ts';
import type { LiveEquipmentPose } from '@/hooks/useEquipmentPositionsLive.ts';

export type {
  CellInfo,
  CellItemInfo,
  TwinOverlayMode,
  WarehouseInteractionMode,
} from '@/components/warehouse3d/warehouse3dTypes.ts';
export type { WarehouseEquipmentKind, WarehouseLayoutSpec };

const FLOOR_COLOR_LIGHT = '#6b7280';
const FLOOR_COLOR_DARK = '#4b5563';
const RACK_FRAME_COLOR_LIGHT = '#4b5563';
const RACK_FRAME_COLOR_DARK = '#64748b';
const FLOOR_LABEL_COLOR_LIGHT = '#e5e7eb';
const FLOOR_LABEL_COLOR_DARK = '#e2e8f0';
/** Вылет номеров рядов за торец стеллажа по X (см. `FloorMarkings`, зебра не должна заходить сюда). */
const FLOOR_ROW_LABEL_X_MARGIN = 1.05;

function isCellFilled(
  geom: WarehouseGeometry,
  rackIndex: number,
  level: number,
  ix: number,
  iz: number,
  occupiedCellKeys?: Set<string> | null,
): boolean {
  return Boolean(
    occupiedCellKeys?.has(
      geom.cellKey(rackIndex, level, ix, iz),
    ),
  );
}

/** Мировые координаты центра ячейки (дефолтная геометрия; внутри Canvas используйте geom из контекста). */
export function getCellWorldPosition(
  row: number,
  level: number,
  cellX: number,
  cellZ: number,
): [number, number, number] {
  return buildWarehouseGeometry(
    DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  ).getCellWorldPosition(row, level, cellX, cellZ);
}

function RackColumnGuard({
  position,
}: {
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, 0.15, 0]}
        material={_sharedMaterials.guardYellow}
      >
        <cylinderGeometry args={[0.065, 0.075, 0.3, 6]} />
      </mesh>
      <mesh
        position={[0, 0.01, 0]}
        material={_sharedMaterials.guardYellow}
      >
        <boxGeometry args={[0.16, 0.02, 0.16]} />
      </mesh>
      <mesh
        position={[0, 0.18, 0]}
        material={_sharedMaterials.guardBlack}
      >
        <cylinderGeometry args={[0.068, 0.068, 0.04, 6]} />
      </mesh>
    </group>
  );
}

function WireMeshDeck({
  width,
  depth,
  y,
}: {
  width: number;
  depth: number;
  y: number;
}) {
  return (
    <group>
      <mesh
        position={[0, y, 0]}
        material={_sharedMaterials.deckGray}
      >
        <boxGeometry args={[width, 0.008, depth]} />
      </mesh>
      {[-width / 4, width / 4].map((x, i) => (
        <mesh
          key={i}
          position={[x, y - 0.006, 0]}
          material={_sharedMaterials.deckSupport}
        >
          <boxGeometry args={[0.015, 0.01, depth]} />
        </mesh>
      ))}
    </group>
  );
}

const _sharedMaterials = {
  beamOrange: new MeshStandardMaterial({
    color: '#ea580c',
    metalness: 0.3,
    roughness: 0.5,
  }),
  clipRed: new MeshStandardMaterial({
    color: '#b91c1c',
    metalness: 0.3,
    roughness: 0.5,
  }),
  guardYellow: new MeshStandardMaterial({
    color: '#eab308',
    metalness: 0.2,
    roughness: 0.6,
  }),
  guardBlack: new MeshStandardMaterial({
    color: '#1c1917',
    metalness: 0.1,
    roughness: 0.8,
  }),
  deckGray: new MeshStandardMaterial({
    color: '#9ca3af',
    metalness: 0.55,
    roughness: 0.4,
    transparent: true,
    opacity: 0.55,
  }),
  deckSupport: new MeshStandardMaterial({
    color: '#6b7280',
    metalness: 0.5,
    roughness: 0.45,
  }),
  labelBlue: new MeshStandardMaterial({
    color: '#1d4ed8',
    metalness: 0.15,
    roughness: 0.6,
  }),
  perfDark: new MeshStandardMaterial({
    color: '#374151',
    metalness: 0.3,
    roughness: 0.7,
  }),
  perfDarkDM: new MeshStandardMaterial({
    color: '#0f172a',
    metalness: 0.3,
    roughness: 0.7,
  }),
};

function Rack({
  rackIndex,
  baseX,
  baseZ,
  selectedCell,
  darkMode,
  onCellClick,
  onCellEnter,
  onCellLeave,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  heatByCellKey,
  hazardByCellKey,
  routeMode,
  onRouteWaypointAdd,
  cellFilter,
}: {
  rackIndex: number;
  baseX: number;
  baseZ: number;
  selectedCell: CellInfo | null;
  darkMode?: boolean;
  onCellClick: (info: CellInfo | null) => void;
  onCellEnter?: (info: CellInfo) => void;
  onCellLeave?: (info: CellInfo) => void;
  occupiedCellKeys?: Set<string> | null;
  expiringCellKeys?: Set<string> | null;
  expiredCellKeys?: Set<string> | null;
  heatByCellKey?: Map<string, number> | null;
  hazardByCellKey?: Map<string, CellStripe> | null;
  routeMode?: boolean;
  onRouteWaypointAdd?: (info: CellInfo) => void;
  cellFilter?: string;
}) {
  const geom = useWarehouseGeometry();
  const rackFrameColor = darkMode
    ? RACK_FRAME_COLOR_DARK
    : RACK_FRAME_COLOR_LIGHT;
  const cells = useMemo(() => {
    const out: Array<{
      level: number;
      ix: number;
      iz: number;
      filled: boolean;
      expiring: boolean;
      expired: boolean;
    }> = [];
    for (let level = 0; level < geom.levels; level++) {
      for (let ix = 0; ix < geom.cellsLength; ix++) {
        for (let iz = 0; iz < geom.cellsDepth; iz++) {
          const key = geom.cellKey(
            rackIndex,
            level,
            ix,
            iz,
          );
          out.push({
            level,
            ix,
            iz,
            filled: isCellFilled(
              geom,
              rackIndex,
              level,
              ix,
              iz,
              occupiedCellKeys,
            ),
            expiring: Boolean(expiringCellKeys?.has(key)),
            expired: Boolean(expiredCellKeys?.has(key)),
          });
        }
      }
    }
    return out;
  }, [
    geom,
    rackIndex,
    occupiedCellKeys,
    expiringCellKeys,
    expiredCellKeys,
  ]);

  const rackH = geom.levels * geom.levelHeight;
  const cellStep = geom.cellSize + geom.cellGap;

  const intermediateUprightPositions = useMemo(() => {
    const positions: number[] = [];
    const step = Math.max(
      3,
      Math.floor(geom.cellsLength / 5),
    );
    for (let i = step; i < geom.cellsLength; i += step) {
      const x = (i - (geom.cellsLength - 1) / 2) * cellStep;
      positions.push(x);
    }
    return positions;
  }, [geom, cellStep]);

  return (
    <group position={[baseX, 0, baseZ]}>
      {/* Vertical uprights (corners) */}
      {[
        [
          -geom.rackLength / 2 - 0.04,
          rackH / 2,
          -geom.rackDepth / 2 - 0.04,
        ],
        [
          geom.rackLength / 2 + 0.04,
          rackH / 2,
          -geom.rackDepth / 2 - 0.04,
        ],
        [
          -geom.rackLength / 2 - 0.04,
          rackH / 2,
          geom.rackDepth / 2 + 0.04,
        ],
        [
          geom.rackLength / 2 + 0.04,
          rackH / 2,
          geom.rackDepth / 2 + 0.04,
        ],
      ].map(([px, py, pz], i) => (
        <group key={`upright-${i}`}>
          <mesh position={[px, py, pz]}>
            <boxGeometry args={[0.08, rackH, 0.08]} />
            <meshStandardMaterial
              color={rackFrameColor}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
          <mesh position={[px, 0.01, pz]}>
            <boxGeometry args={[0.14, 0.02, 0.14]} />
            <meshStandardMaterial
              color={rackFrameColor}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
          {/* Perforation marks (simplified — 1 per level) */}
          {Array.from({ length: geom.levels }, (_, hi) => (
            <mesh
              key={hi}
              position={[px, (hi + 0.5) * geom.levelHeight, pz]}
              material={
                darkMode
                  ? _sharedMaterials.perfDarkDM
                  : _sharedMaterials.perfDark
              }
            >
              <boxGeometry args={[0.09, 0.02, 0.03]} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Intermediate uprights for long racks */}
      {intermediateUprightPositions.map((x, i) =>
        [
          -geom.rackDepth / 2 - 0.04,
          geom.rackDepth / 2 + 0.04,
        ].map((z, zi) => (
          <mesh
            key={`int-up-${i}-${zi}`}
            position={[x, rackH / 2, z]}
          >
            <boxGeometry args={[0.06, rackH, 0.06]} />
            <meshStandardMaterial
              color={rackFrameColor}
              metalness={0.35}
              roughness={0.55}
            />
          </mesh>
        )),
      )}

      {/* Horizontal beams at each level (orange safety beams) */}
      {Array.from({ length: geom.levels + 1 }, (_, lvl) => {
        const beamY = lvl * geom.levelHeight;
        return (
          <group key={`beam-level-${lvl}`}>
            <mesh
              position={[
                0,
                beamY + 0.01,
                -geom.rackDepth / 2 - 0.04,
              ]}
              material={_sharedMaterials.beamOrange}
            >
              <boxGeometry
                args={[geom.rackLength + 0.16, 0.05, 0.035]}
              />
            </mesh>
            <mesh
              position={[
                0,
                beamY + 0.01,
                geom.rackDepth / 2 + 0.04,
              ]}
              material={_sharedMaterials.beamOrange}
            >
              <boxGeometry
                args={[geom.rackLength + 0.16, 0.05, 0.035]}
              />
            </mesh>
            {[
              -geom.rackLength / 2 + 0.15,
              geom.rackLength / 2 - 0.15,
            ].map((clipX, ci) => (
              <mesh
                key={`clip-${lvl}-${ci}`}
                position={[
                  clipX,
                  beamY + 0.035,
                  -geom.rackDepth / 2 - 0.06,
                ]}
                material={_sharedMaterials.clipRed}
              >
                <boxGeometry args={[0.02, 0.02, 0.015]} />
              </mesh>
            ))}
          </group>
        );
      })}

      {/* Wire mesh decking on each level */}
      {Array.from({ length: geom.levels }, (_, lvl) => (
        <WireMeshDeck
          key={`deck-${lvl}`}
          width={geom.rackLength}
          depth={geom.rackDepth}
          y={lvl * geom.levelHeight + 0.005}
        />
      ))}

      {/* Column guards (yellow bollards at rack corners) */}
      {[
        [
          -geom.rackLength / 2 - 0.18,
          0,
          -geom.rackDepth / 2 - 0.18,
        ],
        [
          geom.rackLength / 2 + 0.18,
          0,
          -geom.rackDepth / 2 - 0.18,
        ],
        [
          -geom.rackLength / 2 - 0.18,
          0,
          geom.rackDepth / 2 + 0.18,
        ],
        [
          geom.rackLength / 2 + 0.18,
          0,
          geom.rackDepth / 2 + 0.18,
        ],
      ].map(([gx, gy, gz], gi) => (
        <RackColumnGuard
          key={`guard-${gi}`}
          position={[gx, gy, gz]}
        />
      ))}

      {/* Rack end-cap labels (row number on each end) */}
      {[
        -geom.rackLength / 2 - 0.06,
        geom.rackLength / 2 + 0.06,
      ].map((lx, li) => (
        <group key={`endcap-${li}`}>
          <mesh
            position={[lx, rackH - 0.15, 0]}
            material={_sharedMaterials.labelBlue}
          >
            <boxGeometry
              args={[0.01, 0.22, geom.rackDepth + 0.2]}
            />
          </mesh>
          <Text
            position={[
              lx + (li === 0 ? -0.02 : 0.02),
              rackH - 0.15,
              0,
            ]}
            rotation={[
              0,
              /* troika «лицом» = +Z: −90° → нормаль −X (торец слева), +90° → +X (торец справа) */
              li === 0 ? -Math.PI / 2 : Math.PI / 2,
              0,
            ]}
            fontSize={0.14}
            color='white'
            anchorX='center'
            anchorY='middle'
          >
            {`R${rackIndex + 1}`}
          </Text>
        </group>
      ))}

      {cells.map(
        ({ level, ix, iz, filled, expiring, expired }) => {
          const ox =
            (ix - (geom.cellsLength - 1) / 2) * cellStep;
          const oz =
            (iz - (geom.cellsDepth - 1) / 2) * cellStep;
          const oy =
            level * geom.levelHeight + geom.cellSize / 2 + 0.02;
          const isSelected =
            selectedCell?.row === rackIndex &&
            selectedCell?.level === level &&
            selectedCell?.cellX === ix &&
            selectedCell?.cellZ === iz;
          const info: CellInfo = {
            row: rackIndex,
            level,
            cellX: ix,
            cellZ: iz,
            filled,
          };
          const ckey = geom.cellKey(
            rackIndex,
            level,
            ix,
            iz,
          );
          const matches = cellMatchesFilter(
            cellFilter,
            filled,
            expiring,
            expired,
          );
          if (
            !matches &&
            cellFilter &&
            cellFilter !== 'all' &&
            !isSelected
          ) {
            return null;
          }
          return (
            <StorageCell
              key={ckey}
              filled={filled}
              expiring={expiring}
              expired={expired}
              x={ox}
              y={oy}
              z={oz}
              cellSize={geom.cellSize}
              selected={isSelected}
              darkMode={darkMode}
              heatIntensity={heatByCellKey?.get(ckey)}
              hazardStripe={
                hazardByCellKey?.get(ckey) ?? null
              }
              dimmed={
                !cellMatchesFilter(
                  cellFilter,
                  filled,
                  expiring,
                  expired,
                )
              }
              onCellClick={(shiftKey) => {
                if (routeMode) {
                  onRouteWaypointAdd?.(info);
                  return;
                }
                if (shiftKey && onRouteWaypointAdd) {
                  onRouteWaypointAdd(info);
                  return;
                }
                onCellClick(isSelected ? null : info);
              }}
              onEnter={() => onCellEnter?.(info)}
              onLeave={() => onCellLeave?.(info)}
            />
          );
        },
      )}
    </group>
  );
}

function Floor({ darkMode }: { darkMode?: boolean }) {
  const geom = useWarehouseGeometry();
  const color = darkMode
    ? FLOOR_COLOR_DARK
    : FLOOR_COLOR_LIGHT;
  const w = geom.floorPlanMode
    ? geom.floorWidth
    : geom.floorWidth + 2.5;
  const d = geom.floorPlanMode
    ? geom.floorDepth
    : geom.floorDepth + 2.5;
  const detail = !geom.floorPlanMode;
  const scuffs = useMemo(() => {
    const marks: Array<{
      x: number;
      z: number;
      rot: number;
      w: number;
    }> = [];
    const seed = 42;
    for (let i = 0; i < 12; i++) {
      const h = (seed * (i + 1) * 7919) % 10000;
      marks.push({
        x: (((h % 200) - 100) / 100) * (w / 3),
        z: ((((h * 3) % 200) - 100) / 100) * (d / 3),
        rot: (h % 314) / 100,
        w: 0.15 + (h % 30) / 100,
      });
    }
    return marks;
  }, [w, d]);
  return (
    <group>
      {/* Main concrete floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial
          color={color}
          metalness={0.08}
          roughness={0.92}
        />
      </mesh>
      {detail && (
        <>
      {/* Concrete expansion joint grid */}
      {Array.from(
        { length: Math.floor(w / 4) + 1 },
        (_, i) => -w / 2 + i * 4,
      ).map((x, i) => (
        <mesh
          key={`jx-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[x, 0.02, 0]}
        >
          <planeGeometry args={[0.02, d]} />
          <meshStandardMaterial
            color={darkMode ? '#1e293b' : '#9ca3af'}
            metalness={0.05}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
      {Array.from(
        { length: Math.floor(d / 4) + 1 },
        (_, i) => -d / 2 + i * 4,
      ).map((z, i) => (
        <mesh
          key={`jz-${i}`}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.02, z]}
        >
          <planeGeometry args={[w, 0.02]} />
          <meshStandardMaterial
            color={darkMode ? '#1e293b' : '#9ca3af'}
            metalness={0.05}
            roughness={0.95}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
      {scuffs.map((m, i) => (
        <mesh
          key={`scuff-${i}`}
          rotation={[-Math.PI / 2, m.rot, 0]}
          position={[m.x, 0.025, m.z]}
        >
          <planeGeometry args={[m.w, 0.03]} />
          <meshStandardMaterial
            color={darkMode ? '#0f172a' : '#52525b'}
            metalness={0.05}
            roughness={0.95}
            transparent
            opacity={0.3}
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-2}
          />
        </mesh>
      ))}
        </>
      )}
    </group>
  );
}

function FloorMarkings({
  rowPositions,
  darkMode,
}: {
  rowPositions: Array<{ rowIndex: number; z: number }>;
  darkMode?: boolean;
}) {
  const geom = useWarehouseGeometry();
  /** Чуть дальше от торца рядов по длине стеллажа (−X и +X). */
  const labelXWest =
    -geom.rackLength / 2 - FLOOR_ROW_LABEL_X_MARGIN;
  const labelXEast =
    geom.rackLength / 2 + FLOOR_ROW_LABEL_X_MARGIN;
  const labelColor = darkMode
    ? FLOOR_LABEL_COLOR_DARK
    : FLOOR_LABEL_COLOR_LIGHT;
  return (
    <group>
      {rowPositions.map(({ rowIndex, z }) => (
        <group key={rowIndex}>
          <Text
            position={[labelXWest, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.7}
            color={labelColor}
            anchorX='center'
            anchorY='middle'
            maxWidth={1.5}
          >
            {String(rowIndex)}
          </Text>
          <Text
            position={[labelXEast, 0.02, z]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.7}
            color={labelColor}
            anchorX='center'
            anchorY='middle'
            maxWidth={1.5}
          >
            {String(rowIndex)}
          </Text>
        </group>
      ))}
    </group>
  );
}

function SafetyBollard({
  position,
}: {
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.06, 0.07, 0.7, 6]} />
        <meshStandardMaterial
          color='#eab308'
          metalness={0.3}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 0.35, 0]}>
        <cylinderGeometry args={[0.063, 0.063, 0.06, 6]} />
        <meshStandardMaterial
          color='#1c1917'
          metalness={0.1}
          roughness={0.8}
        />
      </mesh>
    </group>
  );
}

function StackedPallets({
  position,
  count,
}: {
  position: [number, number, number];
  count: number;
}) {
  const totalH = count * 0.16;
  return (
    <group position={position}>
      <mesh position={[0, totalH / 2, 0]}>
        <boxGeometry args={[0.8, totalH, 0.55]} />
        <meshStandardMaterial
          color='#a16207'
          metalness={0.05}
          roughness={0.85}
        />
      </mesh>
      {/* Stringer gaps (dark lines between pallets) */}
      {Array.from(
        { length: Math.min(count, 3) },
        (_, i) => (
          <mesh
            key={i}
            position={[0, (i + 1) * 0.16 - 0.01, 0]}
          >
            <boxGeometry args={[0.82, 0.01, 0.57]} />
            <meshStandardMaterial
              color='#78350f'
              metalness={0.05}
              roughness={0.9}
            />
          </mesh>
        ),
      )}
    </group>
  );
}

function TrafficCone({
  position,
}: {
  position: [number, number, number];
}) {
  return (
    <group position={position}>
      <mesh position={[0, 0.01, 0]}>
        <boxGeometry args={[0.2, 0.02, 0.2]} />
        <meshStandardMaterial
          color='#1c1917'
          roughness={0.9}
        />
      </mesh>
      <mesh position={[0, 0.18, 0]}>
        <cylinderGeometry args={[0.015, 0.07, 0.32, 6]} />
        <meshStandardMaterial
          color='#ea580c'
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>
    </group>
  );
}

function ElectricalPanel({
  position,
  darkMode,
}: {
  position: [number, number, number];
  darkMode?: boolean;
}) {
  return (
    <group position={position}>
      <mesh position={[0, 1.2, 0]}>
        <boxGeometry args={[0.5, 0.7, 0.12]} />
        <meshStandardMaterial
          color={darkMode ? '#374151' : '#6b7280'}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Handle */}
      <mesh position={[0.18, 1.2, 0.07]}>
        <boxGeometry args={[0.025, 0.12, 0.02]} />
        <meshStandardMaterial
          color='#1c1917'
          metalness={0.4}
          roughness={0.5}
        />
      </mesh>
      {/* Warning sign */}
      <mesh position={[0, 1.7, 0]}>
        <boxGeometry args={[0.2, 0.15, 0.008]} />
        <meshStandardMaterial
          color='#eab308'
          metalness={0.1}
          roughness={0.6}
        />
      </mesh>
      {/* Lightning bolt (triangle approximation) */}
      <mesh position={[0, 1.7, 0.006]}>
        <boxGeometry args={[0.03, 0.08, 0.003]} />
        <meshStandardMaterial color='#1c1917' />
      </mesh>
    </group>
  );
}

/** Центры ворот доков по X (согласовано с группами `dock-*` ниже). */
const DOCK_CENTER_X = [-4, 0, 4] as const;

/** Центр апронной зоны между последним проходом и плоскостью доковой стены (для разметки и конвейеров). */
function dockApronMidpointZ(
  geom: WarehouseGeometry,
): number {
  let maxLaneZ = -Infinity;
  for (let r = 0; r < geom.rackRows; r++) {
    maxLaneZ = Math.max(maxLaneZ, pickLaneWorldZ(geom, r));
  }
  const dockWallZ = geom.floorDepth / 2 + 1;
  return (maxLaneZ + dockWallZ) / 2;
}

/** Половина ширины прорези в задней стене под одни ворота (рамка ~2.7 м + запас). */
const DOCK_WALL_GAP_HALF = 1.5;

function WarehouseBuilding({
  darkMode,
}: {
  darkMode?: boolean;
}) {
  const geom = useWarehouseGeometry();
  const hw = geom.floorWidth / 2 + 1;
  const hd = geom.floorDepth / 2 + 1;
  const wallBaseColor = darkMode ? '#334155' : '#cbd5e1';
  const dockColor = darkMode ? '#334155' : '#475569';
  const markingColor = '#eab308';

  const apronMidZ = useMemo(
    () => dockApronMidpointZ(geom),
    [geom],
  );

  /** Задняя стена (z = +hd) режется по X, чтобы не перекрывать ворота доков. */
  const rearWallSegments = useMemo(() => {
    const halfW = (geom.floorWidth + 2) / 2;
    const gaps = DOCK_CENTER_X.map((cx) => {
      const a = Math.max(-halfW, cx - DOCK_WALL_GAP_HALF);
      const b = Math.min(halfW, cx + DOCK_WALL_GAP_HALF);
      return { a, b };
    })
      .filter((g) => g.a < g.b)
      .sort((g1, g2) => g1.a - g2.a);
    const segs: { cx: number; w: number }[] = [];
    let x0 = -halfW;
    for (const { a, b } of gaps) {
      if (a > x0)
        segs.push({ cx: (x0 + a) / 2, w: a - x0 });
      x0 = Math.max(x0, b);
    }
    if (x0 < halfW)
      segs.push({ cx: (x0 + halfW) / 2, w: halfW - x0 });
    return segs;
  }, [geom.floorWidth]);

  /** Плоскость доков чуть снаружи задней стены, чтобы створки не уходили внутрь здания. */
  const dockFaceZ = hd + 0.06;

  const aisleMarkings = useMemo(() => {
    const lines: number[] = [];
    for (let pair = 0; pair < geom.pairs - 1; pair++) {
      const z1 = geom.getRowZ(pair * 2 + 1);
      const z2 = geom.getRowZ((pair + 1) * 2);
      lines.push((z1 + z2) / 2);
    }
    return lines;
  }, [geom]);

  const bollardPositions = useMemo(() => {
    const pts: [number, number, number][] = [];
    for (let pair = 0; pair < geom.pairs; pair++) {
      const z1 = geom.getRowZ(pair * 2);
      const z2 = geom.getRowZ(pair * 2 + 1);
      const midZ = (z1 + z2) / 2;
      for (const xOff of [
        -geom.rackLength / 2 - 0.5,
        geom.rackLength / 2 + 0.5,
      ]) {
        pts.push([xOff, 0, midZ]);
      }
    }
    return pts;
  }, [geom]);

  return (
    <group>
      {/* Wall base strips (low wainscoting so view stays open during orbit) */}
      <mesh position={[0, 1, -hd]}>
        <boxGeometry
          args={[geom.floorWidth + 2, 2, 0.12]}
        />
        <meshStandardMaterial
          color={wallBaseColor}
          metalness={0.15}
          roughness={0.85}
        />
      </mesh>
      {rearWallSegments.map((s, i) => (
        <mesh
          key={`wall-back-${i}`}
          position={[s.cx, 1, hd]}
        >
          <boxGeometry args={[s.w, 2, 0.12]} />
          <meshStandardMaterial
            color={wallBaseColor}
            metalness={0.15}
            roughness={0.85}
          />
        </mesh>
      ))}
      {(
        [
          [-hw, 1, 0, 0.12, 2, geom.floorDepth + 2],
          [hw, 1, 0, 0.12, 2, geom.floorDepth + 2],
        ] as [
          number,
          number,
          number,
          number,
          number,
          number,
        ][]
      ).map(([x, y, z, w, h, d], i) => (
        <mesh key={`wall-side-${i}`} position={[x, y, z]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={wallBaseColor}
            metalness={0.15}
            roughness={0.85}
          />
        </mesh>
      ))}

      {/* Electrical panel */}
      <ElectricalPanel
        position={[hw - 0.08, 0, -hd + 2.5]}
        darkMode={darkMode}
      />

      {/* Safety bollards at aisle ends */}
      {bollardPositions.map((pos, i) => (
        <SafetyBollard
          key={`bollard-${i}`}
          position={pos}
        />
      ))}

      {/* Floor aisle markings (yellow dashed center lines) */}
      {aisleMarkings.map((z, ai) => {
        const segments = Math.max(
          3,
          Math.floor(geom.rackLength / 2.5),
        );
        return Array.from({ length: segments }, (_, si) => {
          const x =
            -geom.rackLength / 2 +
            0.6 +
            si * (geom.rackLength / segments);
          return (
            <mesh
              key={`mark-${ai}-${si}`}
              position={[x, 0.006, z]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[1.0, 0.06]} />
              <meshStandardMaterial color={markingColor} />
            </mesh>
          );
        });
      })}

      {/* Perimeter floor safety lines */}
      {(
        [
          [0, -hd + 0.8, geom.floorWidth, 0.05],
          [0, hd - 0.8, geom.floorWidth, 0.05],
          [-hw + 0.8, 0, 0.05, geom.floorDepth],
          [hw - 0.8, 0, 0.05, geom.floorDepth],
        ] as [number, number, number, number][]
      ).map(([x, z, w, d], i) => (
        <mesh
          key={`safety-${i}`}
          position={[x, 0.006, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[w, d]} />
          <meshStandardMaterial
            color={markingColor}
            opacity={0.7}
            transparent
          />
        </mesh>
      ))}

      {/* Loading dock bays (задняя стена — прорези под ворота, см. rearWallSegments) */}
      {DOCK_CENTER_X.map((x, i) => (
        <group
          key={`dock-${i}`}
          position={[x, 0, dockFaceZ]}
        >
          {/* Dock door panel (sectional roller shutter) */}
          <mesh position={[0, 1.7, 0]}>
            <boxGeometry args={[2.6, 3.4, 0.08]} />
            <meshStandardMaterial
              color={dockColor}
              metalness={0.3}
              roughness={0.7}
            />
          </mesh>
          {/* Door horizontal ribs */}
          {[0.55, 1.2, 1.85, 2.5].map((ry, ri) => (
            <mesh key={ri} position={[0, ry, 0.045]}>
              <boxGeometry args={[2.55, 0.03, 0.01]} />
              <meshStandardMaterial
                color={darkMode ? '#1e293b' : '#374151'}
                metalness={0.35}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Door frame */}
          {(
            [
              [-1.35, 1.7, 0.08, 3.5],
              [1.35, 1.7, 0.08, 3.5],
              [0, 3.45, 2.78, 0.08],
            ] as [number, number, number, number][]
          ).map(([fx, fy, fw, fh], fi) => (
            <mesh
              key={`frame-${fi}`}
              position={[fx, fy, 0.05]}
            >
              <boxGeometry args={[fw, fh, 0.04]} />
              <meshStandardMaterial
                color={markingColor}
                metalness={0.2}
                roughness={0.6}
              />
            </mesh>
          ))}
          {/* Dock bumpers (rubber pads) */}
          {[-0.9, 0.9].map((bx, bi) => (
            <group
              key={`bumper-${bi}`}
              position={[bx, 0.45, 0.08]}
            >
              <mesh>
                <boxGeometry args={[0.25, 0.6, 0.12]} />
                <meshStandardMaterial
                  color='#1c1917'
                  roughness={0.95}
                />
              </mesh>
              <mesh position={[0, 0, 0.065]}>
                <boxGeometry args={[0.28, 0.65, 0.015]} />
                <meshStandardMaterial
                  color='#374151'
                  metalness={0.3}
                  roughness={0.7}
                />
              </mesh>
            </group>
          ))}
          {/* Dock leveler plate */}
          <mesh
            position={[0, 0.01, 0.3]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[2.4, 0.5]} />
            <meshStandardMaterial
              color={darkMode ? '#475569' : '#71717a'}
              metalness={0.45}
              roughness={0.55}
            />
          </mesh>
          {/* Dock leveler tread lines (simplified) */}
          {[0.2, 0.4].map((tz, ri) => (
            <mesh
              key={`tread-${ri}`}
              position={[0, 0.012, tz]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <planeGeometry args={[2.3, 0.04]} />
              <meshStandardMaterial
                color={darkMode ? '#334155' : '#52525b'}
                metalness={0.5}
                roughness={0.4}
              />
            </mesh>
          ))}
          {/* Dock light (green/red status light) */}
          <mesh position={[1.5, 3.2, 0.06]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              color='#22c55e'
              emissive='#22c55e'
              emissiveIntensity={0.5}
            />
          </mesh>
          {/* Dock number */}
          <Text
            position={[0, 3.6, 0.06]}
            fontSize={0.18}
            color='white'
            anchorX='center'
            anchorY='middle'
            maxWidth={1}
          >
            {`ВОРОТА ${i + 1}`}
          </Text>
        </group>
      ))}

      {/* Stacked pallets in dock apron (зона ПР) */}
      <StackedPallets
        position={[-2.5, 0, apronMidZ - 0.35]}
        count={4}
      />
      <StackedPallets
        position={[2.5, 0, apronMidZ - 0.35]}
        count={3}
      />
      <StackedPallets
        position={[-hw + 1.5, 0, apronMidZ - 0.55]}
        count={5}
      />

      {/* Traffic cones at dock/aisle intersections */}
      <TrafficCone
        position={[
          -geom.rackLength / 2 - 1.2,
          0,
          apronMidZ - 0.5,
        ]}
      />
      <TrafficCone
        position={[
          geom.rackLength / 2 + 1.2,
          0,
          apronMidZ - 0.5,
        ]}
      />
      <TrafficCone
        position={[-geom.rackLength / 2 - 1.2, 0, -hd + 2]}
      />

      {/* Floor drain grates */}
      {[-3, 3].map((x, i) => (
        <mesh
          key={`drain-${i}`}
          position={[x, 0.005, apronMidZ + 0.4]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[0.4, 0.4]} />
          <meshStandardMaterial
            color='#3f3f46'
            metalness={0.5}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

function HoverLabel({ cell }: { cell: CellInfo }) {
  const geom = useWarehouseGeometry();
  const position = geom.getCellWorldPosition(
    cell.row,
    cell.level,
    cell.cellX,
    cell.cellZ,
  );
  const labelPosition: [number, number, number] = [
    position[0],
    position[1] + 0.55,
    position[2],
  ];
  return (
    <Html
      position={labelPosition}
      center
      wrapperClass='warehouse-3d-html'
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          padding: '4px 8px',
          background: 'rgba(0,0,0,0.75)',
          color: 'white',
          fontSize: '11px',
          borderRadius: '4px',
          whiteSpace: 'nowrap',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        Ряд {cell.row + 1}, уровень {cell.level + 1}
      </div>
    </Html>
  );
}

export type WarehouseTwinEnrichment = {
  overlayMode: TwinOverlayMode;
  topology: TopologyDocument | null;
  routeGraph: RouteGraphResponse | null;
  equipmentList: TwinEquipmentMarker[];
  liveEquipment?: Map<string, LiveEquipmentPose> | null;
  useRouteGraph?: boolean;
  twinHeatByCellKey: Map<string, number>;
  twinHazardByCellKey: Map<string, CellStripe>;
  twinLayerVisibility: TwinLayersVisibility;
};

function WarehouseContent({
  selectedCell,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  darkMode,
  interactionMode = 'view',
  routeWaypoints = [],
  onRouteWaypointAdd,
  simulationActive = false,
  simulationEquipment = 'forklift',
  simulationSpeed = 1.25,
  simulationShowCargo = true,
  onSimulationComplete,
  twinEnrichment,
  cellFilter,
}: {
  selectedCell: CellInfo | null;
  onCellSelect: (info: CellInfo | null) => void;
  occupiedCellKeys?: Set<string> | null;
  expiringCellKeys?: Set<string> | null;
  expiredCellKeys?: Set<string> | null;
  darkMode?: boolean;
  interactionMode?: WarehouseInteractionMode;
  routeWaypoints?: CellInfo[];
  onRouteWaypointAdd?: (cell: CellInfo) => void;
  simulationActive?: boolean;
  simulationEquipment?: WarehouseEquipmentKind;
  simulationSpeed?: number;
  simulationShowCargo?: boolean;
  onSimulationComplete?: () => void;
  twinEnrichment?: WarehouseTwinEnrichment | null;
  cellFilter?: string;
}) {
  const geom = useWarehouseGeometry();
  const simMotion = useSimMotion();
  const rackFillById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of simMotion.rackFill) {
      map.set(
        item.rackId,
        item.total > 0 ? item.occupied / item.total : 0,
      );
    }
    return map;
  }, [simMotion.rackFill]);
  const [hoveredCell, setHoveredCell] =
    useState<CellInfo | null>(null);
  const handleCellEnter = useCallback(
    (cell: CellInfo) => setHoveredCell(cell),
    [],
  );
  const handleCellLeave = useCallback((cell: CellInfo) => {
    setHoveredCell((prev) =>
      prev &&
      prev.row === cell.row &&
      prev.level === cell.level &&
      prev.cellX === cell.cellX &&
      prev.cellZ === cell.cellZ
        ? null
        : prev,
    );
  }, []);

  const rackPositions = useMemo(() => {
    return Array.from(
      { length: geom.rackRows },
      (_, row) => ({
        rackIndex: row,
        x: geom.getRackBaseX(row),
        z: geom.getRowZ(row),
      }),
    );
  }, [geom]);

  const rowPositions = useMemo(
    () =>
      rackPositions.map(({ rackIndex, z }) => ({
        rowIndex: rackIndex + 1,
        z,
      })),
    [rackPositions],
  );

  const aislePathPoints = useMemo(
    () =>
      buildRoutePolyline(
        geom,
        routeWaypoints,
        ROUTE_FLOOR_Y,
        twinEnrichment?.routeGraph,
        twinEnrichment?.useRouteGraph !== false,
      ),
    [
      geom,
      routeWaypoints,
      twinEnrichment?.routeGraph,
      twinEnrichment?.useRouteGraph,
    ],
  );

  const apronMidZ = useMemo(
    () => dockApronMidpointZ(geom),
    [geom],
  );
  const inboundConveyorLength = useMemo(
    () =>
      Math.min(
        12,
        Math.max(6.5, geom.dockStagingDepth - 2.5),
      ),
    [geom.dockStagingDepth],
  );

  const routeClicksEnabled =
    interactionMode === 'route' && !simulationActive;

  return (
    <>
      <color
        attach='background'
        args={[darkMode ? '#243044' : '#e5e7eb']}
      />
      <ambientLight
        intensity={darkMode ? 0.55 : 0.28}
        color={darkMode ? '#dbeafe' : '#ffffff'}
      />
      <hemisphereLight
        args={[
          darkMode ? '#94a3b8' : '#bfdbfe',
          darkMode ? '#475569' : '#d4d4d8',
          darkMode ? 1.15 : 0.6,
        ]}
      />
      <directionalLight
        position={[12, 18, 8]}
        intensity={darkMode ? 2.4 : 1.8}
        color={darkMode ? '#fff7ed' : '#fff5e6'}
      />
      <directionalLight
        position={[-8, 14, -10]}
        intensity={darkMode ? 1.1 : 0.35}
        color={darkMode ? '#e0f2fe' : '#e2e8f0'}
      />
      <pointLight
        position={[0, 14, 0]}
        intensity={darkMode ? 2.2 : 0.5}
        distance={80}
        decay={1.4}
        color={darkMode ? '#f8fafc' : '#e2e8f0'}
      />
      <pointLight
        position={[-10, 8, -8]}
        intensity={darkMode ? 1.4 : 0.6}
        distance={55}
        decay={1.6}
        color={darkMode ? '#bfdbfe' : '#e2e8f0'}
      />
      <pointLight
        position={[10, 8, 8]}
        intensity={darkMode ? 1.4 : 0.6}
        distance={55}
        decay={1.6}
        color={darkMode ? '#fed7aa' : '#e2e8f0'}
      />
      <ContactShadows
        position={[0, 0.005, 0]}
        opacity={darkMode ? 0.12 : 0.28}
        scale={geom.floorPlanMode ? 140 : 50}
        blur={2.5}
        far={geom.floorPlanMode ? 18 : 12}
      />

      <Floor darkMode={darkMode} />
      <FloorPlanSceneLayers darkMode={darkMode} />
      {!geom.floorPlanMode && (
        <>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, 0.008, apronMidZ]}
          >
            <planeGeometry
              args={[
                geom.floorWidth * 0.9,
                geom.dockStagingDepth * 0.92,
              ]}
            />
            <meshStandardMaterial
              color={darkMode ? '#1e293b' : '#cbd5e1'}
              metalness={0.06}
              roughness={0.88}
              opacity={0.5}
              transparent
            />
          </mesh>
          <FloorMarkings
            rowPositions={rowPositions}
            darkMode={darkMode}
          />
          <WarehouseBuilding darkMode={darkMode} />
          {DOCK_CENTER_X.map((cx, i) => (
            <ConveyorSection
              key={`dock-conv-${i}`}
              length={inboundConveyorLength}
              position={[cx, 0, apronMidZ - 0.35]}
            />
          ))}
          <ConveyorSection
            length={Math.min(20, geom.floorWidth - 4)}
            position={[
              0,
              0,
              apronMidZ + geom.dockStagingDepth * 0.28,
            ]}
            rotation={[0, Math.PI / 2, 0]}
          />
        </>
      )}
      {twinEnrichment && (
        <WarehouseTwinLayers
          topology={twinEnrichment.topology}
          routeGraph={twinEnrichment.routeGraph}
          equipment={twinEnrichment.equipmentList}
          livePositions={twinEnrichment.liveEquipment}
          visibility={twinEnrichment.twinLayerVisibility}
        />
      )}
      {routeWaypoints.length > 0 && (
        <RoutePathLayer
          pathPoints={aislePathPoints}
          cellWaypoints={routeWaypoints}
        />
      )}
      <SimulationEquipmentAlongRoute
        pathPoints={aislePathPoints}
        active={simulationActive}
        speed={simulationSpeed}
        equipmentKind={simulationEquipment}
        showCargo={simulationShowCargo}
        onComplete={onSimulationComplete}
      />
      {hoveredCell && !selectedCell && (
        <HoverLabel cell={hoveredCell} />
      )}
      {rackPositions.map(({ rackIndex, x, z }) =>
        geom.floorPlanMode ? (
          <FloorPlanRackRow
            key={rackIndex}
            rackIndex={rackIndex}
            baseX={x}
            baseZ={z}
            selectedCell={selectedCell}
            darkMode={darkMode}
            onCellClick={onCellSelect}
            onCellEnter={handleCellEnter}
            onCellLeave={handleCellLeave}
            occupiedCellKeys={occupiedCellKeys}
            expiringCellKeys={expiringCellKeys}
            expiredCellKeys={expiredCellKeys}
            heatByCellKey={twinEnrichment?.twinHeatByCellKey}
            hazardByCellKey={
              twinEnrichment?.twinHazardByCellKey
            }
            routeMode={routeClicksEnabled}
            onRouteWaypointAdd={onRouteWaypointAdd}
            cellFilter={cellFilter}
            fillRatio={
              rackFillById.get(
                getFloorPlanRacks()[rackIndex]?.id ?? '',
              ) ?? 0
            }
          />
        ) : (
          <Rack
            key={rackIndex}
            rackIndex={rackIndex}
            baseX={x}
            baseZ={z}
            selectedCell={selectedCell}
            darkMode={darkMode}
            onCellClick={onCellSelect}
            onCellEnter={handleCellEnter}
            onCellLeave={handleCellLeave}
            occupiedCellKeys={occupiedCellKeys}
            expiringCellKeys={expiringCellKeys}
            expiredCellKeys={expiredCellKeys}
            heatByCellKey={twinEnrichment?.twinHeatByCellKey}
            hazardByCellKey={
              twinEnrichment?.twinHazardByCellKey
            }
            routeMode={routeClicksEnabled}
            onRouteWaypointAdd={onRouteWaypointAdd}
            cellFilter={cellFilter}
          />
        ),
      )}
    </>
  );
}

/** Фокус камеры только при переходе по «Показать на складе 3D» (focusCell), не при клике по ячейке. */
function CameraFocusOnCell({
  focusCell,
  onFocusDone,
}: {
  focusCell: CellInfo | null;
  onFocusDone?: () => void;
}) {
  const geom = useWarehouseGeometry();
  const appliedKeyRef = useRef<string | null>(null);
  const frameCountRef = useRef(0);

  useFrame((state) => {
    const { camera, controls, invalidate } = state;
    const c = controls as unknown as
      | {
          target: {
            set: (x: number, y: number, z: number) => void;
          };
          update?: () => void;
        }
      | undefined;

    if (!focusCell) {
      appliedKeyRef.current = null;
      frameCountRef.current = 0;
      return;
    }

    const key = geom.cellKey(
      focusCell.row,
      focusCell.level,
      focusCell.cellX,
      focusCell.cellZ,
    );
    if (appliedKeyRef.current === key) return;

    if (!c?.target?.set) return;
    frameCountRef.current += 1;
    if (frameCountRef.current < 2) return;

    const [cx, cy, cz] = geom.getCellWorldPosition(
      focusCell.row,
      focusCell.level,
      focusCell.cellX,
      focusCell.cellZ,
    );
    const dist = 14;
    c.target.set(cx, cy, cz);
    camera.position.set(cx, cy + 6, cz - dist);
    c.update?.();
    appliedKeyRef.current = key;
    invalidate?.();
    onFocusDone?.();
  });
  return null;
}

/** Индикатор загрузки сцены (Suspense / R3F 9). Показывается, пока активна загрузка ресурсов. */
function SceneLoadOverlay() {
  const { active, progress } = useProgress();
  if (!active) return null;
  return (
    <Html
      fullscreen
      center
      wrapperClass='warehouse-3d-html'
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          width: '100%',
          height: '100%',
          background: 'rgba(255,255,255,0.85)',
          fontSize: 14,
          color: '#374151',
        }}
      >
        <span>Подготовка 3D сцены…</span>
        {progress > 0 && (
          <div
            style={{
              width: 120,
              height: 4,
              background: '#e5e7eb',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.min(100, progress)}%`,
                height: '100%',
                background: '#3b82f6',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        )}
      </div>
    </Html>
  );
}

interface WarehouseSceneProps {
  /** Выбранная ячейка (показ попапа, подсветка). */
  selectedCell?: CellInfo | null;
  /** Ячейка, на которую нужно один раз навести камеру (только при переходе по «Показать на складе 3D»). */
  focusCell?: CellInfo | null;
  /** Вызывается после применения фокуса камеры на focusCell (чтобы страница сбросила focusCell). */
  onFocusDone?: () => void;
  onCellSelect?: (info: CellInfo | null) => void;
  occupiedCellKeys?: Set<string> | null;
  expiringCellKeys?: Set<string> | null;
  expiredCellKeys?: Set<string> | null;
  darkMode?: boolean;
  cellFilter?: string;
  /** Spec из GET /api/v1/warehouse/layout (поля rows, levels, cellX, cellZ). */
  layoutSpec?: WarehouseLayoutSpec | null;
  /** Просмотр ячеек или прокладка маршрута по клику. */
  interactionMode?: WarehouseInteractionMode;
  /** Точки маршрута (порядок = порядок проезда). */
  routeWaypoints?: CellInfo[];
  /** В режиме маршрута: клик по ячейке добавляет точку. */
  onRouteWaypointAdd?: (cell: CellInfo) => void;
  /** Анимация движения техники по `routeWaypoints`. */
  simulationActive?: boolean;
  simulationEquipment?: WarehouseEquipmentKind;
  /** Скорость в единицах сцены в секунду (масштаб ~ метры). */
  simulationSpeed?: number;
  simulationShowCargo?: boolean;
  onSimulationComplete?: () => void;
  /** Зоны, проходы, граф маршрутов, heatmap по ячейкам — см. страницу 3D. */
  twinEnrichment?: WarehouseTwinEnrichment | null;
  /** Режим свободной камеры (WASD / стрелки + мышь). */
  freeCameraMode?: boolean;
}

export function WarehouseScene({
  selectedCell: selectedCellFromParent,
  focusCell,
  onFocusDone,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  expiredCellKeys,
  darkMode,
  layoutSpec,
  interactionMode = 'view',
  routeWaypoints = [],
  onRouteWaypointAdd,
  simulationActive = false,
  simulationEquipment = 'forklift',
  simulationSpeed = 1.25,
  simulationShowCargo = true,
  onSimulationComplete,
  twinEnrichment = null,
  freeCameraMode = false,
  cellFilter,
}: WarehouseSceneProps) {
  const [internalCell, setInternalCell] =
    useState<CellInfo | null>(null);
  const isControlled = selectedCellFromParent !== undefined;
  const selectedCell = isControlled
    ? (selectedCellFromParent ?? null)
    : internalCell;

  const handleCellSelect = useCallback(
    (info: CellInfo | null) => {
      if (!isControlled) setInternalCell(info);
      onCellSelect?.(info ?? null);
    },
    [onCellSelect, isControlled],
  );

  const needsContinuousFrames =
    freeCameraMode ||
    simulationActive ||
    (expiredCellKeys?.size ?? 0) > 0 ||
    (expiringCellKeys?.size ?? 0) > 0;
  const [glEpoch, setGlEpoch] = useState(0);
  const glLostCount = useRef(0);
  const resolvedLayout = resolveFloorPlanLayoutSpec(
    layoutSpec ?? DEFAULT_WAREHOUSE_LAYOUT_SPEC,
  );
  const floorPlanView = isFloorPlanLayoutSpec(resolvedLayout);

  return (
    <div className='h-full w-full touch-none outline-none'>
      <Canvas
        key={glEpoch}
        className='h-full w-full outline-none'
        frameloop={
          needsContinuousFrames ? 'always' : 'demand'
        }
        camera={{
          position: floorPlanView ? [52, 82, 72] : [20, 16, 20],
          fov: 45,
          near: floorPlanView ? 0.8 : 0.1,
          far: floorPlanView ? 450 : 280,
        }}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          powerPreference: 'default',
          failIfMajorPerformanceCaveat: false,
        }}
        onCreated={({ gl }) => {
          const el = gl.domElement;
          el.removeAttribute('tabindex');
          el.style.touchAction = 'none';
          const onLost = (ev: Event) => {
            ev.preventDefault();
            if (glLostCount.current >= 2) return;
            glLostCount.current += 1;
            setGlEpoch((n) => n + 1);
          };
          el.addEventListener('webglcontextlost', onLost);
        }}
      >
        <WarehouseGeometryProvider spec={resolvedLayout}>
          <SceneLoadOverlay />
          <WarehouseContent
            selectedCell={selectedCell}
            onCellSelect={handleCellSelect}
            occupiedCellKeys={occupiedCellKeys}
            expiringCellKeys={expiringCellKeys}
            expiredCellKeys={expiredCellKeys}
            darkMode={darkMode}
            interactionMode={interactionMode}
            routeWaypoints={routeWaypoints}
            onRouteWaypointAdd={onRouteWaypointAdd}
            simulationActive={simulationActive}
            simulationEquipment={simulationEquipment}
            simulationSpeed={simulationSpeed}
            simulationShowCargo={simulationShowCargo}
            onSimulationComplete={onSimulationComplete}
            twinEnrichment={twinEnrichment}
            cellFilter={cellFilter}
          />
          <CameraFocusOnCell
            focusCell={focusCell ?? null}
            onFocusDone={onFocusDone}
          />
        </WarehouseGeometryProvider>
        {freeCameraMode ? (
          <FreeCameraController />
        ) : (
          <OrbitControls
            enablePan
            enableZoom
            minDistance={floorPlanView ? 22 : 14}
            maxDistance={floorPlanView ? 220 : 90}
            target={[0, floorPlanView ? 2.2 : 2, 0]}
            maxPolarAngle={Math.PI / 2 - 0.1}
          />
        )}
      </Canvas>
    </div>
  );
}
