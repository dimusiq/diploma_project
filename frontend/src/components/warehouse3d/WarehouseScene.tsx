/**
 * Warehouse digital twin: 12 rows (6 pairs with passages),
 * artificial light, floor markings 1–12, cell click. No walls, no shadows.
 * Optimized for React Three Fiber.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, Text, useCursor } from '@react-three/drei';
import type { MeshStandardMaterial } from 'three';

const FLOOR_COLOR_LIGHT = '#6b7280';
const FLOOR_COLOR_DARK = '#374151';
const RACK_FRAME_COLOR_LIGHT = '#4b5563';
const RACK_FRAME_COLOR_DARK = '#1f2937';
const CELL_EMPTY_COLOR_LIGHT = '#9ca3af';
const CELL_EMPTY_COLOR_DARK = '#4b5563';
const CELL_FILLED_COLOR = '#3b82f6';
const CELL_HOVER_COLOR = '#93c5fd';
const CELL_SELECTED_COLOR = '#fbbf24';
const CELL_EXPIRING_COLOR = '#dc2626';
const FLOOR_LABEL_COLOR_LIGHT = '#e5e7eb';
const FLOOR_LABEL_COLOR_DARK = '#6b7280';
const CELL_SIZE = 0.72;
const CELL_GAP = 0.12;
const LEVEL_HEIGHT = 0.82;

const RACK_ROWS = 12;
const PAIRS = 6;
const CELLS_LENGTH = 20;
const CELLS_DEPTH = 1;
const LEVELS = 4;

const RACK_LENGTH = CELLS_LENGTH * (CELL_SIZE + CELL_GAP) - CELL_GAP;
const RACK_DEPTH = CELLS_DEPTH * (CELL_SIZE + CELL_GAP) - CELL_GAP;
const PASSAGE_WIDTH = 2.5;
const BLOCK_WIDTH = 2 * RACK_DEPTH;
const TOTAL_Z = PAIRS * BLOCK_WIDTH + (PAIRS - 1) * PASSAGE_WIDTH;
const FLOOR_MARGIN = 3;
const FLOOR_WIDTH = RACK_LENGTH + FLOOR_MARGIN * 2;
const FLOOR_DEPTH = TOTAL_Z + FLOOR_MARGIN * 2;

function getRowZ(rowIndex: number): number {
  const pair = Math.floor(rowIndex / 2);
  const inPair = rowIndex % 2;
  const blockStart = -TOTAL_Z / 2 + pair * (BLOCK_WIDTH + PASSAGE_WIDTH);
  return blockStart + RACK_DEPTH / 2 + inPair * RACK_DEPTH;
}

function cellKey(row: number, level: number, ix: number, iz: number): string {
  return `${row}-${level}-${ix}-${iz}`;
}

function isCellFilled(
  rackIndex: number,
  level: number,
  ix: number,
  iz: number,
  occupiedCellKeys?: Set<string> | null
): boolean {
  return Boolean(occupiedCellKeys?.has(cellKey(rackIndex, level, ix, iz)));
}

export interface CellInfo {
  row: number;
  level: number;
  cellX: number;
  cellZ: number;
  filled: boolean;
}

/** Мировые координаты центра ячейки для всплывающего окна */
export function getCellWorldPosition(
  row: number,
  level: number,
  cellX: number,
  cellZ: number
): [number, number, number] {
  const baseZ = getRowZ(row);
  const ox = (cellX - (CELLS_LENGTH - 1) / 2) * (CELL_SIZE + CELL_GAP);
  const oy = level * LEVEL_HEIGHT + CELL_SIZE / 2 + 0.02;
  const oz = (cellZ - (CELLS_DEPTH - 1) / 2) * (CELL_SIZE + CELL_GAP);
  return [ox, oy, baseZ + oz];
}

export interface CellItemInfo {
  id?: string;
  title: string;
  description?: string | null;
  quantity?: number;
  unit?: string | null;
  sku?: string | null;
  expires_at?: string | null;
  location?: string | null;
  status: string;
  expiringSoon?: boolean;
}

function StorageCell({
  filled,
  expiring,
  x,
  y,
  z,
  selected,
  darkMode,
  onCellClick,
  onEnter,
  onLeave,
}: {
  filled: boolean;
  expiring: boolean;
  x: number;
  y: number;
  z: number;
  selected?: boolean;
  darkMode?: boolean;
  onCellClick?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const materialRef = useRef<MeshStandardMaterial>(null);
  useCursor(hover, 'pointer', 'auto');

  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;
    if (expiring) {
      const t = state.clock.elapsedTime;
      mat.color.setStyle(CELL_EXPIRING_COLOR);
      mat.emissive.setStyle(CELL_EXPIRING_COLOR);
      mat.emissiveIntensity = 0.2 + 0.35 * Math.sin(t * 4);
      return;
    }
    mat.emissiveIntensity = 0;
    mat.emissive.setStyle('#000000');
    if (selected) {
      mat.color.setStyle(CELL_SELECTED_COLOR);
      mat.emissive.setStyle('#b45309');
      mat.emissiveIntensity = 0.15;
    } else if (hover) {
      mat.color.setStyle(CELL_HOVER_COLOR);
    } else if (filled) {
      mat.color.setStyle(CELL_FILLED_COLOR);
    } else {
      mat.color.setStyle(darkMode ? CELL_EMPTY_COLOR_DARK : CELL_EMPTY_COLOR_LIGHT);
    }
  });

  const baseColor = expiring
    ? CELL_EXPIRING_COLOR
    : selected
      ? CELL_SELECTED_COLOR
      : hover
        ? CELL_HOVER_COLOR
        : filled
          ? CELL_FILLED_COLOR
          : (darkMode ? CELL_EMPTY_COLOR_DARK : CELL_EMPTY_COLOR_LIGHT);

  return (
    <mesh
      position={[x, y, z]}
      onClick={(e) => {
        e.stopPropagation();
        onCellClick?.();
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHover(true);
        onEnter?.();
      }}
      onPointerOut={() => {
        setHover(false);
        onLeave?.();
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <boxGeometry args={[CELL_SIZE, CELL_SIZE, CELL_SIZE]} />
      <meshStandardMaterial
        ref={materialRef}
        color={baseColor}
        metalness={0.1}
        roughness={0.7}
      />
    </mesh>
  );
}

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
}) {
  const rackFrameColor = darkMode ? RACK_FRAME_COLOR_DARK : RACK_FRAME_COLOR_LIGHT;
  const cells = useMemo(() => {
    const out: Array<{ level: number; ix: number; iz: number; filled: boolean; expiring: boolean }> = [];
    for (let level = 0; level < LEVELS; level++) {
      for (let ix = 0; ix < CELLS_LENGTH; ix++) {
        for (let iz = 0; iz < CELLS_DEPTH; iz++) {
          const key = cellKey(rackIndex, level, ix, iz);
          out.push({
            level,
            ix,
            iz,
            filled: isCellFilled(rackIndex, level, ix, iz, occupiedCellKeys),
            expiring: Boolean(expiringCellKeys?.has(key)),
          });
        }
      }
    }
    return out;
  }, [rackIndex, occupiedCellKeys, expiringCellKeys]);

  const rackH = LEVELS * LEVEL_HEIGHT;

  return (
    <group position={[baseX, 0, baseZ]}>
      {[
        [-RACK_LENGTH / 2 - 0.04, rackH / 2, -RACK_DEPTH / 2 - 0.04],
        [RACK_LENGTH / 2 + 0.04, rackH / 2, -RACK_DEPTH / 2 - 0.04],
        [-RACK_LENGTH / 2 - 0.04, rackH / 2, RACK_DEPTH / 2 + 0.04],
        [RACK_LENGTH / 2 + 0.04, rackH / 2, RACK_DEPTH / 2 + 0.04],
      ].map(([px, py, pz], i) => (
        <mesh key={i} position={[px, py, pz]}>
          <boxGeometry args={[0.08, rackH, 0.08]} />
          <meshStandardMaterial color={rackFrameColor} metalness={0.3} roughness={0.6} />
        </mesh>
      ))}
      {cells.map(({ level, ix, iz, filled, expiring }, i) => {
        const ox = (ix - (CELLS_LENGTH - 1) / 2) * (CELL_SIZE + CELL_GAP);
        const oz = (iz - (CELLS_DEPTH - 1) / 2) * (CELL_SIZE + CELL_GAP);
        const oy = level * LEVEL_HEIGHT + CELL_SIZE / 2 + 0.02;
        const isSelected =
          selectedCell?.row === rackIndex &&
          selectedCell?.level === level &&
          selectedCell?.cellX === ix &&
          selectedCell?.cellZ === iz;
        const info: CellInfo = { row: rackIndex, level, cellX: ix, cellZ: iz, filled };
        return (
          <StorageCell
            key={i}
            filled={filled}
            expiring={expiring}
            x={ox}
            y={oy}
            z={oz}
            selected={isSelected}
            darkMode={darkMode}
            onCellClick={() => onCellClick(isSelected ? null : info)}
            onEnter={() => onCellEnter?.(info)}
            onLeave={() => onCellLeave?.(info)}
          />
        );
      })}
    </group>
  );
}

function Floor({ darkMode }: { darkMode?: boolean }) {
  const color = darkMode ? FLOOR_COLOR_DARK : FLOOR_COLOR_LIGHT;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
      <planeGeometry args={[FLOOR_WIDTH, FLOOR_DEPTH]} />
      <meshStandardMaterial color={color} metalness={0.05} roughness={0.9} />
    </mesh>
  );
}

function CellPopup({
  position,
  cellLabel,
  item,
  onClose,
}: {
  position: [number, number, number];
  cellLabel: string;
  item: CellItemInfo | null;
  onClose: () => void;
}) {
  // Для нижних уровней поднимаем попап выше ячейки, чтобы не обрезался по краю экрана
  const cellY = position[1];
  const liftY = cellY < 1.4 ? 1.1 : 0;
  const offsetPosition: [number, number, number] = [
    position[0] + 1.2,
    cellY + liftY,
    position[2],
  ];
  return (
    <Html position={offsetPosition} center style={{ pointerEvents: 'auto' }}>
      <div
        className="cell-popup"
        style={{
          minWidth: '220px',
          maxWidth: '320px',
          padding: '12px 14px',
          background: 'white',
          borderRadius: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: '13px',
          color: '#1a1a1a',
          border: '1px solid #e2e8f0',
          animation: 'cellPopupIn 0.18s ease-out',
        }}
      >
        <style>{`
          @keyframes cellPopupIn {
            from { opacity: 0; transform: scale(0.96); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
        <div style={{ fontWeight: 600, marginBottom: 8, fontSize: '14px' }}>{cellLabel}</div>
        {item ? (
          <>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{item.title}</div>
            {item.description && (
              <div style={{ color: '#64748b', marginBottom: 6, fontSize: '12px' }}>{item.description}</div>
            )}
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
              <span>Кол-во: {item.quantity ?? 1}</span>
              {item.unit && <span>Ед.: {item.unit}</span>}
              {item.sku && <span>Артикул: {item.sku}</span>}
            </div>
            {item.expires_at && (
              <div style={{ marginBottom: 4 }}>
                Срок годности: {new Date(item.expires_at).toLocaleDateString('ru-RU')}
                {item.expiringSoon && (
                  <span style={{ marginLeft: 6, color: '#dc2626', fontWeight: 600 }}>Скоро истекает</span>
                )}
              </div>
            )}
            {item.location && <div style={{ color: '#64748b', fontSize: '12px' }}>Место: {item.location}</div>}
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: 6 }}>Статус: {item.status}</div>
            {item.id && (
              <a
                href={`/items?open=${encodeURIComponent(item.id)}`}
                style={{
                  display: 'inline-block',
                  marginTop: 8,
                  fontSize: '12px',
                  color: '#1f80aa',
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Подробнее →
              </a>
            )}
          </>
        ) : (
          <div style={{ color: '#64748b' }}>Ячейка свободна</div>
        )}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          style={{
            marginTop: 10,
            padding: '4px 10px',
            fontSize: '12px',
            cursor: 'pointer',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: '6px',
          }}
        >
          Закрыть
        </button>
      </div>
    </Html>
  );
}

function FloorMarkings({
  rowPositions,
  darkMode,
}: {
  rowPositions: Array<{ rowIndex: number; z: number }>;
  darkMode?: boolean;
}) {
  const labelX = -RACK_LENGTH / 2 - 0.6;
  const labelColor = darkMode ? FLOOR_LABEL_COLOR_DARK : FLOOR_LABEL_COLOR_LIGHT;
  return (
    <group>
      {rowPositions.map(({ rowIndex, z }) => (
        <Text
          key={rowIndex}
          position={[labelX, 0.02, z]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.7}
          color={labelColor}
          anchorX="center"
          anchorY="middle"
          maxWidth={1.5}
        >
          {String(rowIndex)}
        </Text>
      ))}
    </group>
  );
}

function HoverLabel({ cell }: { cell: CellInfo }) {
  const position = getCellWorldPosition(cell.row, cell.level, cell.cellX, cell.cellZ);
  const labelPosition: [number, number, number] = [position[0], position[1] + 0.55, position[2]];
  return (
    <Html position={labelPosition} center style={{ pointerEvents: 'none' }}>
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

function WarehouseContent({
  selectedCell,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  selectedItem,
  darkMode,
}: {
  selectedCell: CellInfo | null;
  onCellSelect: (info: CellInfo | null) => void;
  occupiedCellKeys?: Set<string> | null;
  expiringCellKeys?: Set<string> | null;
  selectedItem?: CellItemInfo | null;
  darkMode?: boolean;
}) {
  const [hoveredCell, setHoveredCell] = useState<CellInfo | null>(null);
  const handleCellEnter = useCallback((cell: CellInfo) => setHoveredCell(cell), []);
  const handleCellLeave = useCallback((cell: CellInfo) => {
    setHoveredCell((prev) =>
      prev && prev.row === cell.row && prev.level === cell.level && prev.cellX === cell.cellX && prev.cellZ === cell.cellZ
        ? null
        : prev
    );
  }, []);

  const rackPositions = useMemo(() => {
    return Array.from({ length: RACK_ROWS }, (_, row) => ({
      rackIndex: row,
      x: 0,
      z: getRowZ(row),
    }));
  }, []);

  const rowPositions = useMemo(
    () =>
      rackPositions.map(({ rackIndex, z }) => ({
        rowIndex: rackIndex + 1,
        z,
      })),
    [rackPositions]
  );

  return (
    <>
      <ambientLight intensity={0.85} />
      <pointLight position={[0, 6, 0]} intensity={1.5} distance={50} decay={2} />
      <pointLight position={[-8, 5, -6]} intensity={0.9} distance={35} decay={2} />
      <pointLight position={[8, 5, -6]} intensity={0.9} distance={35} decay={2} />
      <pointLight position={[-8, 5, 6]} intensity={0.9} distance={35} decay={2} />
      <pointLight position={[8, 5, 6]} intensity={0.9} distance={35} decay={2} />

      <Floor darkMode={darkMode} />
      <FloorMarkings rowPositions={rowPositions} darkMode={darkMode} />
      {hoveredCell && !selectedCell && (
        <HoverLabel cell={hoveredCell} />
      )}
      {selectedCell && (
        <CellPopup
          position={getCellWorldPosition(
            selectedCell.row,
            selectedCell.level,
            selectedCell.cellX,
            selectedCell.cellZ
          )}
          cellLabel={`Ячейка: ряд ${selectedCell.row + 1}, уровень ${selectedCell.level + 1}, позиция ${selectedCell.cellX + 1}`}
          item={selectedItem ?? null}
          onClose={() => onCellSelect(null)}
        />
      )}
      {rackPositions.map(({ rackIndex, x, z }) => (
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
        />
      ))}
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
  const appliedKeyRef = useRef<string | null>(null);
  const frameCountRef = useRef(0);

  useFrame((state) => {
    const { camera, controls, invalidate } = state;
    const c = controls as unknown as
      | { target: { set: (x: number, y: number, z: number) => void }; update?: () => void }
      | undefined;

    if (!focusCell) {
      appliedKeyRef.current = null;
      frameCountRef.current = 0;
      return;
    }

    const key = cellKey(focusCell.row, focusCell.level, focusCell.cellX, focusCell.cellZ);
    if (appliedKeyRef.current === key) return;

    if (!c?.target?.set) return;
    frameCountRef.current += 1;
    if (frameCountRef.current < 2) return;

    const [cx, cy, cz] = getCellWorldPosition(
      focusCell.row,
      focusCell.level,
      focusCell.cellX,
      focusCell.cellZ
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
  selectedItem?: CellItemInfo | null;
  darkMode?: boolean;
}

export function WarehouseScene({
  selectedCell: selectedCellFromParent,
  focusCell,
  onFocusDone,
  onCellSelect,
  occupiedCellKeys,
  expiringCellKeys,
  selectedItem,
  darkMode,
}: WarehouseSceneProps) {
  const [internalCell, setInternalCell] = useState<CellInfo | null>(null);
  const isControlled = selectedCellFromParent !== undefined;
  const selectedCell = isControlled ? selectedCellFromParent ?? null : internalCell;

  const handleCellSelect = useCallback(
    (info: CellInfo | null) => {
      if (!isControlled) setInternalCell(info);
      onCellSelect?.(info ?? null);
    },
    [onCellSelect, isControlled]
  );

  return (
    <Canvas
      camera={{
        position: [20, 16, 20],
        fov: 45,
        near: 0.1,
        far: 150,
      }}
      gl={{ antialias: true }}
      onPointerMissed={() => handleCellSelect(null)}
    >
      <WarehouseContent
        selectedCell={selectedCell}
        onCellSelect={handleCellSelect}
        occupiedCellKeys={occupiedCellKeys}
        expiringCellKeys={expiringCellKeys}
        selectedItem={selectedItem}
        darkMode={darkMode}
      />
      <CameraFocusOnCell focusCell={focusCell ?? null} onFocusDone={onFocusDone} />
      <OrbitControls
        enablePan
        enableZoom
        minDistance={14}
        maxDistance={55}
        target={[0, 2, 0]}
        maxPolarAngle={Math.PI / 2 - 0.1}
      />
    </Canvas>
  );
}
