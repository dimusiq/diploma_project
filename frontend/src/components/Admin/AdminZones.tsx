import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"

import { type ZonePublic, zonesApi } from "@/api/zones.ts"
import { AdminPanel } from "@/components/Admin/AdminPanel.tsx"
import { ConfirmDialog } from "@/components/Common/ConfirmDialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import { Input } from "@/components/ui/input.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"

function AddZone() {
  const [name, setName] = useState("")
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const create = useMutation({
    mutationFn: () => zonesApi.create({ name: name.trim() }),
    onSuccess: () => {
      setName("")
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось создать зону",
      )
    },
  })
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <Input
        placeholder="Новая зона склада"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="max-w-xs"
      />
      <Button
        variant="outlineSky"
        size="sm"
        onClick={() => create.mutate()}
        disabled={!name.trim()}
        loading={create.isPending}
      >
        Добавить зону
      </Button>
    </div>
  )
}

function EditZone({ zone }: { zone: ZonePublic }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState(zone.name)
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const update = useMutation({
    mutationFn: () => zonesApi.update(zone.id, { name: name.trim() }),
    onSuccess: () => {
      setOpen(false)
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось обновить зону",
      )
    },
  })

  const onOpen = () => {
    setName(zone.name)
    setOpen(true)
  }

  return (
    <>
      <Button size="xs" variant="outline" onClick={onOpen}>
        Изменить
      </Button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="min-w-[280px] rounded-lg border border-border bg-card p-4 text-card-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <p className="mb-3 font-bold">Редактировать зону</p>
            <div className="mb-4 flex flex-col gap-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Название"
                className="h-7 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Отмена
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => update.mutate()}
                loading={update.isPending}
                disabled={!name.trim()}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function ZonesList() {
  const queryClient = useQueryClient()
  const { showErrorToast } = useCustomToast()
  const [deleteConfirm, setDeleteConfirm] = useState<{
    id: string
    name: string
  } | null>(null)
  const { data: zones = [] } = useQuery({
    queryKey: ["zones"],
    queryFn: () => zonesApi.list(),
  })
  const deleteZone = useMutation({
    mutationFn: (id: string) => zonesApi.delete(id),
    onSuccess: () => {
      setDeleteConfirm(null)
      queryClient.invalidateQueries({ queryKey: ["zones"] })
    },
    onError: (err) => {
      showErrorToast(
        err instanceof Error ? err.message : "Не удалось удалить зону",
      )
    },
  })

  if (zones.length === 0) return null
  return (
    <>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Название</TableHead>
              <TableHead>Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {zones.map((z) => (
              <TableRow key={z.id}>
                <TableCell>{z.name}</TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <EditZone zone={z} />
                    <Button
                      size="xs"
                      variant="outlineDestructive"
                      onClick={() =>
                        setDeleteConfirm({ id: z.id, name: z.name })
                      }
                      disabled={deleteZone.isPending}
                    >
                      Удалить
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={deleteConfirm != null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        title="Удалить зону?"
        description={
          deleteConfirm
            ? `Удалить зону «${deleteConfirm.name}»? Это действие нельзя отменить.`
            : ""
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        variant="danger"
        isLoading={deleteZone.isPending}
        onConfirm={() => deleteConfirm && deleteZone.mutate(deleteConfirm.id)}
      />
    </>
  )
}

export function AdminZones() {
  return (
    <AdminPanel
      title="Зоны склада"
      description="Справочник зон для раздела «Техника». Создание и изменение — только для суперпользователя."
      mb={0}
    >
      <AddZone />
      <ZonesList />
    </AdminPanel>
  )
}
