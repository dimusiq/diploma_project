import { useSyncExternalStore } from "react"
import type { DataSnapshot, MotionSnapshot } from "./simStore.ts"
import { deviceSimulation } from "./simStore.ts"

/** Снимок движения техники и транспорта (публикуется 20 раз в секунду). */
export function useSimMotion(): MotionSnapshot {
  return useSyncExternalStore(
    deviceSimulation.subscribeMotion,
    deviceSimulation.getMotionSnapshot,
    deviceSimulation.getMotionSnapshot,
  )
}

/** Снимок таблиц, метрик и журнала событий (публикуется 4 раза в секунду). */
export function useSimData(): DataSnapshot {
  return useSyncExternalStore(
    deviceSimulation.subscribeData,
    deviceSimulation.getDataSnapshot,
    deviceSimulation.getDataSnapshot,
  )
}
