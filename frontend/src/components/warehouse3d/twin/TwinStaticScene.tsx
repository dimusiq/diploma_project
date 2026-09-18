import { memo } from "react"
import type { SimZone } from "@/components/deviceServer/simTypes.ts"
import { RackSystem } from "@/components/warehouse3d/twin/RackSystem.tsx"
import { TwinInfrastructure } from "@/components/warehouse3d/twin/TwinInfrastructure.tsx"

export const TwinStaticScene = memo(function TwinStaticScene({
  zones,
  darkMode,
}: {
  zones: SimZone[]
  darkMode?: boolean
}) {
  return (
    <group>
      <ambientLight
        intensity={darkMode ? 0.78 : 0.9}
        color={darkMode ? "#e2e8f0" : "#f8fafc"}
      />
      <hemisphereLight
        args={[
          darkMode ? "#cbd5e1" : "#f5f5f4",
          darkMode ? "#57534e" : "#a8a29e",
          darkMode ? 0.62 : 0.5,
        ]}
      />
      <directionalLight
        position={[42, 72, 28]}
        intensity={darkMode ? 1.15 : 1.25}
        color={darkMode ? "#f8fafc" : "#fff7ed"}
        castShadow={false}
      />
      <TwinInfrastructure zones={zones} darkMode={darkMode} />
      <RackSystem />
    </group>
  )
})
