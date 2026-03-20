import { Sector } from "recharts"

const POP_OUT = 6

type PieHoverSectorInput = {
  cx: number
  cy: number
  innerRadius: number
  outerRadius: number
  startAngle: number
  endAngle: number
  fill?: string
  cornerRadius?: number
  className?: string
}

/** Подсветка сегмента кольца/круга по дуге (не прямоугольный курсор). */
export function pieHoverActiveShape(p: PieHoverSectorInput) {
  return (
    <Sector
      cx={p.cx}
      cy={p.cy}
      innerRadius={p.innerRadius}
      outerRadius={p.outerRadius + POP_OUT}
      startAngle={p.startAngle}
      endAngle={p.endAngle}
      fill={p.fill}
      cornerRadius={p.cornerRadius}
      className={p.className}
      stroke="rgba(255,255,255,0.92)"
      strokeWidth={2}
    />
  )
}

/** Остальные секторы, пока активен tooltip по одному из них. */
export const pieHoverInactiveStyle = { opacity: 0.42 }
