import { useTheme } from "next-themes"

import { Label } from "@/components/ui/label.tsx"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group.tsx"

const Appearance = () => {
  const { theme, setTheme } = useTheme()

  return (
    <div className="w-full max-w-full space-y-4">
      <h2 className="py-4 text-lg font-medium">Выбор темы</h2>

      <RadioGroup
        value={theme ?? "system"}
        onValueChange={(v) => setTheme(String(v))}
        className="grid gap-3"
      >
        <div className="flex items-center gap-2">
          <RadioGroupItem value="system" id="theme-system" />
          <Label htmlFor="theme-system" className="font-normal">
            Системная
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="light" id="theme-light" />
          <Label htmlFor="theme-light" className="font-normal">
            Светлая тема
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <RadioGroupItem value="dark" id="theme-dark" />
          <Label htmlFor="theme-dark" className="font-normal">
            Темная тема
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}
export default Appearance
