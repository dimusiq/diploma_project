import { useCursor } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { RefObject } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { MeshStandardMaterial } from 'three';
import {
  CellStatusMark,
  PalletLoad,
} from '@/components/warehouse3d/PalletRackVisuals.tsx';
import { palletCargoVariant } from '@/components/warehouse3d/palletRackLayout.ts';
import type { CellStripe } from '@/components/warehouse3d/twin3dDerived.ts';
import {
  CELL_BLOCKED_COLOR,
  CELL_EMPTY_COLOR_DARK,
  CELL_EMPTY_COLOR_LIGHT,
  CELL_EXPIRED_COLOR,
  CELL_EXPIRING_COLOR,
  CELL_FILLED_COLOR,
  CELL_HOVER_COLOR,
  CELL_QUARANTINE_COLOR,
  CELL_RESERVED_COLOR,
  CELL_SELECTED_COLOR,
} from '@/components/warehouse3d/warehouse3dColors.ts';
import { CELL_SIZE } from '@/components/warehouse3d/warehouseGeometry.tsx';

function CellEmissivePulse({
  materialRef,
  expired,
  dimmed,
}: {
  materialRef: RefObject<MeshStandardMaterial | null>;
  expired: boolean;
  dimmed?: boolean;
}) {
  useFrame((state) => {
    const mat = materialRef.current;
    if (!mat) return;
    mat.opacity = dimmed ? 0.4 : 1;
    mat.transparent = Boolean(dimmed);
    const t = state.clock.elapsedTime;
    if (expired) {
      mat.color.setStyle(CELL_EXPIRED_COLOR);
      mat.emissive.setStyle(CELL_EXPIRED_COLOR);
      mat.emissiveIntensity = 0.15 + 0.3 * Math.sin(t * 4);
      return;
    }
    mat.color.setStyle(CELL_EXPIRING_COLOR);
    mat.emissive.setStyle(CELL_EXPIRING_COLOR);
    mat.emissiveIntensity = 0.2 + 0.35 * Math.sin(t * 4);
  });
  return null;
}

type StorageCellProps = {
  filled: boolean;
  expiring: boolean;
  expired: boolean;
  x: number;
  y: number;
  z: number;
  selected?: boolean;
  darkMode?: boolean;
  heatIntensity?: number;
  hazardStripe?: CellStripe | null;
  dimmed?: boolean;
  cellSize?: number;
  cellHeight?: number;
  cellDepth?: number;
  visualMode?: 'box' | 'pallet';
  aisleSign?: 1 | -1;
  cellKey?: string;
  onCellClick?: (shiftKey: boolean) => void;
  onEnter?: () => void;
  onLeave?: () => void;
};

export function StorageCell({
  filled,
  expiring,
  expired,
  x,
  y,
  z,
  selected,
  darkMode,
  heatIntensity,
  hazardStripe,
  dimmed,
  cellSize,
  cellHeight,
  cellDepth,
  visualMode = 'box',
  aisleSign = -1,
  cellKey,
  onCellClick,
  onEnter,
  onLeave,
}: StorageCellProps) {
  const [hover, setHover] = useState(false);
  const materialRef = useRef<MeshStandardMaterial>(null);
  const pointerDownRef = useRef<{
    x: number;
    y: number;
  } | null>(null);
  useCursor(hover, 'pointer', 'auto');
  const pulsing = expired || expiring;
  const boxW = cellSize ?? CELL_SIZE;
  const boxH = cellHeight ?? boxW;
  const boxD = cellDepth ?? boxW;

  useEffect(() => {
    const mat = materialRef.current;
    if (!mat || pulsing || visualMode === 'pallet') return;
    mat.opacity = dimmed ? 0.28 : 1;
    mat.transparent = Boolean(dimmed);
    if (hazardStripe === 'blocked') {
      mat.color.setStyle(CELL_BLOCKED_COLOR);
      mat.emissive.setStyle(CELL_BLOCKED_COLOR);
      mat.emissiveIntensity = 0.12;
      return;
    }
    if (hazardStripe === 'reserved') {
      mat.color.setStyle(CELL_RESERVED_COLOR);
      mat.emissive.setStyle('#b45309');
      mat.emissiveIntensity = 0.12;
      return;
    }
    if (hazardStripe === 'quarantine') {
      mat.color.setStyle(CELL_QUARANTINE_COLOR);
      mat.emissive.setStyle(CELL_QUARANTINE_COLOR);
      mat.emissiveIntensity = 0.15;
      return;
    }
    const hi = heatIntensity ?? 0;
    if (hi > 0.02) {
      const r = 0.55 + hi * 0.42;
      const g = 0.55 - hi * 0.35;
      const b = 0.65 - hi * 0.45;
      mat.color.setRGB(
        r,
        Math.max(0.2, g),
        Math.max(0.15, b),
      );
      mat.emissive.setRGB(r * 0.4, g * 0.2, 0.05);
      mat.emissiveIntensity = 0.08 + hi * 0.22;
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
      mat.color.setStyle(
        darkMode
          ? CELL_EMPTY_COLOR_DARK
          : CELL_EMPTY_COLOR_LIGHT,
      );
    }
  }, [
    pulsing,
    dimmed,
    hazardStripe,
    heatIntensity,
    selected,
    hover,
    filled,
    darkMode,
    visualMode,
  ]);

  const baseColor = expired
    ? CELL_EXPIRED_COLOR
    : expiring
      ? CELL_EXPIRING_COLOR
      : hazardStripe === 'blocked'
        ? CELL_BLOCKED_COLOR
        : hazardStripe === 'reserved'
          ? CELL_RESERVED_COLOR
          : hazardStripe === 'quarantine'
            ? CELL_QUARANTINE_COLOR
            : (heatIntensity ?? 0) > 0.02
              ? `rgb(${Math.round(55 + (heatIntensity ?? 0) * 200)}, ${Math.round(140 - (heatIntensity ?? 0) * 90)}, ${Math.round(165 - (heatIntensity ?? 0) * 120)})`
              : selected
                ? CELL_SELECTED_COLOR
                : hover
                  ? CELL_HOVER_COLOR
                  : filled
                    ? CELL_FILLED_COLOR
                    : darkMode
                      ? CELL_EMPTY_COLOR_DARK
                      : CELL_EMPTY_COLOR_LIGHT;

  const pointerHandlers = {
    onPointerDown: (e: { stopPropagation: () => void; clientX: number; clientY: number }) => {
      e.stopPropagation();
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
      };
    },
    onPointerUp: (e: {
      stopPropagation: () => void;
      clientX: number;
      clientY: number;
      shiftKey: boolean;
    }) => {
      e.stopPropagation();
      const start = pointerDownRef.current;
      pointerDownRef.current = null;
      if (!start) return;
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (dx * dx + dy * dy > 36) return;
      onCellClick?.(e.shiftKey);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      setHover(true);
      onEnter?.();
    },
    onPointerOut: () => {
      setHover(false);
      onLeave?.();
    },
  };

  if (visualMode === 'pallet') {
    const variant = palletCargoVariant(cellKey ?? `${x}-${y}-${z}`);
    return (
      <group position={[x, y, z]}>
        <mesh
          onPointerDown={pointerHandlers.onPointerDown}
          onPointerUp={pointerHandlers.onPointerUp}
          onPointerOver={pointerHandlers.onPointerOver}
          onPointerOut={pointerHandlers.onPointerOut}
        >
          <boxGeometry args={[boxW, boxH, boxD]} />
          <meshStandardMaterial
            color='#000000'
            transparent
            opacity={0.001}
            depthWrite={false}
          />
        </mesh>
        {filled && (
          <group
            position={[0, -boxH / 2 + 0.05, 0]}
            visible={!dimmed || Boolean(selected)}
          >
            <PalletLoad
              variant={variant}
              maxHeight={boxH}
              lanes={boxW >= 2.2 ? 2 : 1}
            />
          </group>
        )}
        <CellStatusMark
          stripe={hazardStripe}
          selected={selected}
          hover={hover}
          expiring={expiring}
          expired={expired}
          heatIntensity={heatIntensity}
          aisleSign={aisleSign}
          cellW={boxW}
          cellH={boxH}
          cellD={boxD}
        />
      </group>
    );
  }

  return (
    <>
      <mesh
        position={[x, y, z]}
        onPointerDown={pointerHandlers.onPointerDown}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerOver={pointerHandlers.onPointerOver}
        onPointerOut={pointerHandlers.onPointerOut}
      >
        <boxGeometry
          args={[boxW, boxH, boxD]}
        />
        <meshStandardMaterial
          ref={materialRef}
          color={baseColor}
          metalness={0.1}
          roughness={0.7}
          transparent={Boolean(dimmed)}
          opacity={dimmed ? 0.28 : 1}
        />
      </mesh>
      {pulsing && (
        <CellEmissivePulse
          materialRef={materialRef}
          expired={expired}
          dimmed={dimmed}
        />
      )}
    </>
  );
}
