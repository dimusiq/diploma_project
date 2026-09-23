import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { personnelApi, type PersonnelWrite } from "@/api/personnel.ts"
import { PersonnelDetail } from "@/components/personnel/PersonnelDetail.tsx"
import { PersonnelFilters } from "@/components/personnel/PersonnelFilters.tsx"
import { PersonnelForm } from "@/components/personnel/PersonnelForm.tsx"
import { PersonnelTable } from "@/components/personnel/PersonnelTable.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { canEditPersonnel, canViewPersonnel } from "@/lib/personnelAccess.ts"
import { EMPTY_FILTERS, fullName, type PersonnelFilters as Filters, type PersonnelRecord } from "@/lib/personnel.ts"

export function PersonnelPage() {
  const user = useCurrentUser()
  const canView = canViewPersonnel(user)
  const canEdit = canEditPersonnel(user)
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [editing, setEditing] = useState<PersonnelRecord | null | undefined>(undefined)
  const [opened, setOpened] = useState<PersonnelRecord | null>(null)

  const list = useQuery({
    queryKey: ["personnel", filters],
    queryFn: () =>
      personnelApi.list({
        q: filters.q || undefined,
        status: filters.status || undefined,
        position: filters.position || undefined,
        shift: filters.shift || undefined,
      }),
    enabled: canView,
    refetchInterval: 2000,
  })
  const activity = useQuery({
    queryKey: ["personnel-activity", opened?.id],
    queryFn: () => personnelApi.activity(opened!.id),
    enabled: Boolean(opened),
    refetchInterval: 2000,
  })

  const save = useMutation({
    mutationFn: async (body: PersonnelWrite) => {
      if (editing && editing.id) return personnelApi.update(editing.id, body)
      return personnelApi.create(body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] })
      setEditing(undefined)
      toast.success("Сотрудник сохранён")
    },
    onError: () => toast.error("Не удалось сохранить сотрудника"),
  })
  const deactivate = useMutation({
    mutationFn: (id: string) => personnelApi.deactivate(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] })
      toast.success("Сотрудник деактивирован")
    },
    onError: () => toast.error("Не удалось деактивировать сотрудника"),
  })

  if (!canView) {
    return <p className="p-6 text-sm text-muted-foreground">Недостаточно прав для просмотра персонала</p>
  }

  const rows = list.data?.data ?? []
  const tasks = activity.data?.task_id ? [{ id: activity.data.task_id, title: activity.data.task_id }] : []

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Персонал</h1>
        {canEdit ? (
          <Button type="button" onClick={() => setEditing(null)}>
            + Добавить
          </Button>
        ) : null}
      </div>
      <PersonnelFilters value={filters} onChange={setFilters} />
      {list.isError ? <p className="text-sm text-destructive">Не удалось загрузить персонал</p> : null}
      <PersonnelTable
        rows={rows}
        canEdit={canEdit}
        onOpen={setOpened}
        onEdit={setEditing}
        onDeactivate={(row) => deactivate.mutate(row.id)}
      />
      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Сотрудник" : "Новый сотрудник"}</DialogTitle>
          </DialogHeader>
          {editing !== undefined ? (
            <PersonnelForm
              key={editing?.id ?? "new"}
              initial={editing}
              submitting={save.isPending}
              onSubmit={(body) => save.mutate(body)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <Sheet open={Boolean(opened)} onOpenChange={(open) => !open && setOpened(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{opened ? fullName(opened) : "Сотрудник"}</SheetTitle>
          </SheetHeader>
          {opened ? (
            <PersonnelDetail employee={opened} activity={activity.data ?? null} tasks={tasks} events={[]} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  )
}
