import type { CellFilter } from "@/components/warehouse3d/warehouse3dSearch.ts"
import type { CellInfo } from "@/components/warehouse3d/warehouse3dTypes.ts"
import {
  getFloorPlanRacks,
  planToWorldX,
  planToWorldZ,
  WAREHOUSE_DEPTH,
  WAREHOUSE_WIDTH,
  ZONES,
} from "@/components/warehouse3d/warehouseFloorPlanAdapter.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"
import { cn } from "@/lib/utils.ts"

type WarehouseMiniMapProps = {
  geom: WarehouseGeometry
  selectedCell: CellInfo | null
  routeWaypoints: CellInfo[]
  cellFilter: CellFilter
  className?: string
  onSelectRow?: (rowZeroBased: number) => void
}

/** План сверху: ряды, выбранная ячейка и точки маршрута. */
export function WarehouseMiniMap({
  geom,
  selectedCell,
  routeWaypoints,
  cellFilter,
  className,
  onSelectRow,
}: WarehouseMiniMapProps) {
  const w = geom.floorWidth
  const d = geom.floorDepth
  const pad = 0.08
  const viewW = 100
  const viewH = (d / w) * viewW

  const toSvg = (x: number, z: number) => ({
    sx: ((x + w / 2) / w) * viewW,
    sy: ((z + d / 2) / d) * viewH,
  })

  const rows = geom.floorPlanMode
    ? getFloorPlanRacks().map((rack, row) => {
        const wx = planToWorldX(rack.x + rack.w / 2)
        const wz = planToWorldZ(rack.z + rack.d / 2)
        const p = toSvg(wx, wz)
        return { row, y: p.sy, x: p.sx, rw: (rack.w / w) * viewW, rd: (rack.d / d) * viewH }
      })
    : Array.from({ length: geom.rackRows }, (_, row) => {
        const z = geom.getRowZ(row)
        const p = toSvg(0, z)
        return { row, y: p.sy, x: p.sx, rw: viewW * 0.76, rd: 1.2 }
      })

  const zoneRects = geom.floorPlanMode
    ? ZONES.map((zone) => {
        const cx = planToWorldX(zone.x + zone.w / 2)
        const cz = planToWorldZ(zone.z + zone.d / 2)
        const p = toSvg(cx, cz)
        return {
          id: zone.id,
          x: p.sx - (zone.w / w) * viewW * 0.5,
          y: p.sy - (zone.d / d) * viewH * 0.5,
          rw: (zone.w / w) * viewW,
          rh: (zone.d / d) * viewH,
        }
      })
    : []

  return (
    <div
      className={cn(
        "absolute bottom-2 left-2 z-10 overflow-hidden rounded-md border border-border/80 bg-background/90 shadow-sm backdrop-blur-sm",
        onSelectRow ? "pointer-events-auto" : "pointer-events-none",
        className,
      )}
      aria-hidden={!onSelectRow}
    >
      <svg
        viewBox={`${-pad * viewW} ${-pad * viewH} ${viewW * (1 + 2 * pad)} ${viewH * (1 + 2 * pad)}`}
        className="h-[88px] w-[120px] sm:h-[100px] sm:w-[140px]"
      >
        <title>Мини-карта склада</title>
        <rect
          x={0}
          y={0}
          width={viewW}
          height={viewH}
          fill="currentColor"
          className="text-muted/40"
          rx={1}
        />
        {zoneRects.map((z) => (
          <rect
            key={z.id}
            x={z.x}
            y={z.y}
            width={z.rw}
            height={z.rh}
            className="fill-primary/5 stroke-border/50"
            rx={0.3}
          />
        ))}
        {rows.map(({ row, y, x, rw, rd }) => (
          <rect
            key={row}
            x={geom.floorPlanMode ? x - rw / 2 : viewW * 0.12}
            y={y - rd / 2}
            width={geom.floorPlanMode ? rw : viewW * 0.76}
            height={geom.floorPlanMode ? Math.max(rd, 1) : 1.2}
            className={cn(
              "fill-muted-foreground/25",
              onSelectRow && "cursor-pointer hover:fill-primary/50",
            )}
            rx={0.3}
            onClick={
              onSelectRow
                ? (e) => {
                    e.stopPropagation()
                    onSelectRow(row)
                  }
                : undefined
            }
            role={onSelectRow ? "button" : undefined}
            aria-label={onSelectRow ? `Ряд ${row + 1}` : undefined}
          />
        ))}
        {routeWaypoints.map((wp, i) => {
          const [x, , z] = geom.getCellWorldPosition(
            wp.row,
            wp.level,
            wp.cellX,
            wp.cellZ,
          )
          const p = toSvg(x, z)
          return (
            <circle
              key={`${wp.row}-${wp.level}-${wp.cellX}-${wp.cellZ}-${i}`}
              cx={p.sx}
              cy={p.sy}
              r={1.4}
              className="fill-orange-500"
            />
          )
        })}
        {selectedCell &&
          (() => {
            const [x, , z] = geom.getCellWorldPosition(
              selectedCell.row,
              selectedCell.level,
              selectedCell.cellX,
              selectedCell.cellZ,
            )
            const p = toSvg(x, z)
            return (
              <rect
                x={p.sx - 1.6}
                y={p.sy - 1.6}
                width={3.2}
                height={3.2}
                className="fill-amber-400 stroke-amber-600"
                strokeWidth={0.35}
                rx={0.4}
              />
            )
          })()}
      </svg>
      {cellFilter !== "all" && (
        <p className="border-t border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          Фильтр: {cellFilter}
          {geom.floorPlanMode ? ` · ${WAREHOUSE_WIDTH}×${WAREHOUSE_DEPTH} м` : ""}
        </p>
      )}
    </div>
  )
}
