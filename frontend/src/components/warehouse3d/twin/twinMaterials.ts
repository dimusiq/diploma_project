/**
 * Shared low-poly materials/geometry for the Warehouse Digital Twin.
 * Module-level reuse keeps 16 racks + fleet + infrastructure cheap.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  MeshStandardMaterial,
} from "three"

export const TWIN_GEOM = {
  box: new BoxGeometry(1, 1, 1),
  wheel: new CylinderGeometry(1, 1, 1, 12),
  post: new CylinderGeometry(1, 1, 1, 10),
  dome: new CylinderGeometry(1, 0.65, 1, 12),
}

export const TWIN_MAT = {
  concrete: new MeshStandardMaterial({
    color: "#b7b3ab",
    roughness: 0.92,
    metalness: 0.03,
  }),
  concreteDark: new MeshStandardMaterial({
    color: "#8b8680",
    roughness: 0.9,
    metalness: 0.04,
  }),
  asphalt: new MeshStandardMaterial({
    color: "#57534e",
    roughness: 0.94,
    metalness: 0.02,
  }),
  steel: new MeshStandardMaterial({
    color: "#64748b",
    metalness: 0.72,
    roughness: 0.34,
  }),
  beamSteel: new MeshStandardMaterial({
    color: "#c2410c",
    metalness: 0.58,
    roughness: 0.4,
  }),
  darkMetal: new MeshStandardMaterial({
    color: "#1f2937",
    metalness: 0.7,
    roughness: 0.38,
  }),
  safetyYellow: new MeshStandardMaterial({
    color: "#eab308",
    metalness: 0.22,
    roughness: 0.48,
  }),
  safetyBlack: new MeshStandardMaterial({
    color: "#1c1917",
    metalness: 0.12,
    roughness: 0.78,
  }),
  wood: new MeshStandardMaterial({
    color: "#b45309",
    metalness: 0.04,
    roughness: 0.86,
  }),
  cardboard: new MeshStandardMaterial({
    color: "#c4a574",
    metalness: 0.02,
    roughness: 0.82,
  }),
  emergency: new MeshStandardMaterial({
    color: "#b91c1c",
    metalness: 0.35,
    roughness: 0.45,
  }),
  glass: new MeshStandardMaterial({
    color: "#93c5fd",
    metalness: 0.15,
    roughness: 0.12,
    transparent: true,
    opacity: 0.38,
  }),
  rubber: new MeshStandardMaterial({
    color: "#292524",
    metalness: 0.08,
    roughness: 0.88,
  }),
  wall: new MeshStandardMaterial({
    color: "#d6d3d1",
    roughness: 0.86,
    metalness: 0.04,
  }),
  wallDark: new MeshStandardMaterial({
    color: "#475569",
    roughness: 0.82,
    metalness: 0.08,
  }),
  cabinBlue: new MeshStandardMaterial({
    color: "#1d4ed8",
    metalness: 0.35,
    roughness: 0.42,
  }),
  cabinGreen: new MeshStandardMaterial({
    color: "#047857",
    metalness: 0.35,
    roughness: 0.42,
  }),
  agvBody: new MeshStandardMaterial({
    color: "#0ea5e9",
    metalness: 0.45,
    roughness: 0.4,
  }),
  forkliftYellow: new MeshStandardMaterial({
    color: "#f59e0b",
    metalness: 0.32,
    roughness: 0.46,
  }),
}