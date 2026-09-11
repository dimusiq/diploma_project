import type { CellInfo } from "@/components/warehouse3d/WarehouseScene.tsx"
import type { CellFilter } from "@/components/warehouse3d/warehouse3dSearch.ts"
import type { WarehouseGeometry } from "@/components/warehouse3d/warehouseGeometry.tsx"
import { cn } from "@/lib/utils.ts"

type WarehouseMiniMapProps = {
  geom: WarehouseGeometry
  selectedCell: CellInfo | null
  routeWaypoints: CellInfo[]
  cellFilter: CellFilter
  className?: string
}

/** План сверху: ряды, выбранная ячейка и точки маршрута. */
export function WarehouseMiniMap({
  geom,
  selectedCell,
  routeWaypoints,
  cellFilter,
  className,
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

  const rows = Array.from({ length: geom.rackRows }, (_, row) => {
    const z = geom.getRowZ(row)
    const p = toSvg(0, z)
    return { row, y: p.sy }
  })

  return (
    <div
      className={cn(
        "pointer-events-none absolute bottom-2 left-2 z-10 overflow-hidden rounded-md border border-border/80 bg-background/90 shadow-sm backdrop-blur-sm",
        className,
      )}
      aria-hidden
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
        {rows.map(({ row, y }) => (
          <rect
            key={row}
            x={viewW * 0.12}
            y={y - 0.6}
            width={viewW * 0.76}
            height={1.2}
            className="fill-muted-foreground/25"
            rx={0.3}
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
        {selectedCell && (
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
          })()
        )}
      </svg>
      {cellFilter !== "all" && (
        <p className="border-t border-border/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          Фильтр: {cellFilter}
        </p>
      )}
    </div>
  )
}
