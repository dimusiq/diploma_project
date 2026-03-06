import { Button, ButtonGroup, Field, Text } from "@chakra-ui/react"
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
} from "@/components/ui/dialog.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

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
          <Text fontSize="sm" color="fg.muted" mb={3}>
            Выбрано единиц техники: {selectedIds.length}. Укажите зону склада.
          </Text>
          <Field.Root>
            <Field.Label>Зона</Field.Label>
            <select
              value={zoneId}
              onChange={(e) => setZoneId(e.target.value)}
              style={{
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid var(--chakra-colors-border)",
                minWidth: "200px",
                fontSize: "14px",
              }}
            >
              <option value="">— Не назначена —</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field.Root>
        </DialogBody>
        <DialogFooter>
          <ButtonGroup>
            <DialogActionTrigger asChild>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Отмена
              </Button>
            </DialogActionTrigger>
            <Button
              onClick={handleConfirm}
              loading={mutation.isPending}
            >
              Назначить
            </Button>
          </ButtonGroup>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
