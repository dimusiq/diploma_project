/** Presentation pose for existing sim workers. Not a second simulation. */

const AISLE_WALKER_ID = "wrk-1"
const CYCLE_SEC = 36
const IN_VIEW_SEC = 14

export function isAisleWalker(workerId: string): boolean {
  return workerId === AISLE_WALKER_ID
}

export function aisleWalkerOffset(timeSec: number): { forward: number; side: number } {
  const phase = ((timeSec % CYCLE_SEC) + CYCLE_SEC) % CYCLE_SEC
  if (phase < IN_VIEW_SEC) return { forward: 4.2, side: 0.35 }
  return { forward: -5, side: 7 }
}

export function offsetFromHeading(
  heading: number,
  forward: number,
  side: number,
): { x: number; z: number } {
  return {
    x: Math.sin(heading) * forward + Math.cos(heading) * side,
    z: Math.cos(heading) * forward - Math.sin(heading) * side,
  }
}

export function crewPlanPosition(index: number): { x: number; z: number; heading: number } {
  return {
    x: 14 + (index % 4) * 7,
    z: 42 + Math.floor(index / 4) * 4,
    heading: 0,
  }
}
