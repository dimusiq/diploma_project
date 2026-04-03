import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { equipmentApi } from "@/api/equipment.ts"
import { zonesApi } from "@/api/zones.ts"
import {
  DialogActionTrigger,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
} from "@/components/ui/app-dialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Field } from "@/components/ui/field.tsx"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import {
  fromSelectAll,
  SELECT_ALL_VALUE,
  toSelectAll,
} from "@/lib/selectAllValue.ts"

interface MassAssignZoneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: string[]
  onSuccess: () => void
}

export function MassAssignZoneDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: MassAssignZoneDialogProps) {
  const [zoneId, setZoneId] = useState<string>("")
  const queryClient = useQueryClient()
  const { showSuccessToast, showErrorToast } = useCustomToast()

  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
    enabled: open,
  })

  useEffect(() => {
    if (open && zones.length > 0 && !zoneId) setZoneId(zones[0].id)
  }, [open, zones, zoneId])

  const mutation = useMutation({
    mutationFn: async (zoneName: string | null) => {
      await Promise.all(
        selectedIds.map((id) =>
          equipmentApi.update(id, { zone: zoneName ?? null }),
        ),
      )
    },
    onSuccess: (_, zoneName) => {
      const name = zoneName || "Не назначена"
      showSuccessToast(
        `Зона «${name}» назначена для техники: ${selectedIds.length} шт.`,
      )
      onSuccess()
      onOpenChange(false)
    },
    onError: (e: Error) => {
      showErrorToast(e.message || "Ошибка при назначении зоны")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment"] })
    },
  })

  const selectedZone = zones.find((z) => z.id === zoneId)
  const handleConfirm = () => {
    const value = zoneId ? (selectedZone?.name ?? null) : null
    mutation.mutate(value)
  }

  return (
    <DialogRoot open={open} onOpenChange={(e) => onOpenChange(e.open)}>
      <DialogContent>
        <DialogCloseTrigger />
        <DialogHeader>
          <DialogTitle>Назначить зону выбранной технике</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3 text-sm text-muted-foreground">
            Выбрано единиц техники: {selectedIds.length}. Укажите зону склада.
          </p>
          <Field label="Зона">
            <Select
              value={toSelectAll(zoneId)}
              onValueChange={(v) => setZoneId(fromSelectAll(v))}
            >
              <SelectTrigger className="h-9 min-w-[200px] text-sm">
                <SelectValue placeholder="Зона" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SELECT_ALL_VALUE}>
                  — Не назначена —
                </SelectItem>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {z.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </DialogBody>
        <DialogFooter>
          <div className="flex flex-wrap gap-2">
            <DialogActionTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button
              variant="outline"
              size="sm"
              onClick={handleConfirm}
              loading={mutation.isPending}
            >
              Назначить
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
