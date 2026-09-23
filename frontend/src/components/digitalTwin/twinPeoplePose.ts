/** Fixed presentation pose for existing sim workers. Not a second simulation. */

export function crewPlanPosition(index: number): { x: number; z: number; heading: number } {
  return {
    x: 14 + (index % 4) * 7,
    z: 42 + Math.floor(index / 4) * 4,
    heading: 0,
  }
}
