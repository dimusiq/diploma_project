import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState } from "react"
import { toast } from "sonner"
import { personnelApi, type PersonnelWrite } from "@/api/personnel.ts"
import { PersonnelBraceletPanel } from "@/components/personnel/PersonnelBraceletPanel.tsx"
import { PersonnelBulkBar } from "@/components/personnel/PersonnelBulkBar.tsx"
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
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import { canEditPersonnel, canViewPersonnel } from "@/lib/personnelAccess.ts"
import {
  EMPTY_FILTERS,
  fullName,
  type PersonnelFilters as Filters,
  type PersonnelRecord,
} from "@/lib/personnel.ts"

export function PersonnelPage() {
  const user = useCurrentUser()
  const canView = canViewPersonnel(user)
  const canEdit = canEditPersonnel(user)
  const queryClient = useQueryClient()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [editing, setEditing] = useState<PersonnelRecord | null | undefined>(undefined)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

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

  const departmentsQuery = useQuery({
    queryKey: ["personnel", "departments"],
    queryFn: () => personnelApi.departments(),
    enabled: canView && canEdit,
  })

  const rows = list.data?.data ?? []

  const liveEditing =
    editing && editing.id
      ? (rows.find((row) => row.id === editing.id) ?? editing)
      : editing

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
  const remove = useMutation({
    mutationFn: (id: string) => personnelApi.remove(id),
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] })
      setSelectedIds((current) => {
        const next = new Set(current)
        next.delete(id)
        return next
      })
      toast.success("Сотрудник удалён")
    },
    onError: () => toast.error("Не удалось удалить сотрудника"),
  })
  const bulkMove = useMutation({
    mutationFn: (department: string) =>
      personnelApi.bulkDepartment({
        worker_ids: [...selectedIds],
        department,
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] })
      setSelectedIds(new Set())
      toast.success(result.message)
    },
    onError: () => toast.error("Не удалось переместить сотрудников"),
  })
  const bulkDelete = useMutation({
    mutationFn: () => personnelApi.bulkDelete({ worker_ids: [...selectedIds] }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["personnel"] })
      setSelectedIds(new Set())
      toast.success(result.message)
    },
    onError: () => toast.error("Не удалось удалить сотрудников"),
  })

  if (!canView) {
    return <p className="p-6 text-sm text-muted-foreground">Недостаточно прав для просмотра персонала</p>
  }

  const title =
    editing === null
      ? "Новый сотрудник"
      : editing
        ? fullName(editing)
        : "Сотрудник"

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
      <PersonnelBulkBar
        selectedCount={selectedIds.size}
        canEdit={canEdit}
        departments={departmentsQuery.data?.data ?? []}
        departmentsLoading={departmentsQuery.isLoading}
        moving={bulkMove.isPending}
        deleting={bulkDelete.isPending}
        onClear={() => setSelectedIds(new Set())}
        onMove={(department) => bulkMove.mutate(department)}
        onDelete={() => bulkDelete.mutate()}
      />
      <PersonnelTable
        rows={rows}
        canEdit={canEdit}
        selectedIds={selectedIds}
        onSelectedIdsChange={setSelectedIds}
        onEdit={setEditing}
        onDelete={(row) => remove.mutate(row.id)}
      />
      <Dialog open={editing !== undefined} onOpenChange={(open) => !open && setEditing(undefined)}>
        <DialogContent
          className="max-h-[90vh] overflow-y-auto sm:max-w-xl"
          data-testid="personnel-edit-dialog"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {editing !== undefined ? (
            <PersonnelForm
              key={editing?.id ?? "new"}
              initial={editing}
              submitting={save.isPending}
              onCancel={() => setEditing(undefined)}
              onSubmit={(body) => save.mutate(body)}
              footer={
                liveEditing && liveEditing.id ? (
                  <PersonnelBraceletPanel
                    employee={liveEditing}
                    canEdit={canEdit}
                    onEmployeeChange={(row) => setEditing(row)}
                  />
                ) : null
              }
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
