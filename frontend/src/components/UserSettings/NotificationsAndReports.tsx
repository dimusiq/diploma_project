import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  type CommunicationPreferenceKind,
  communicationPreferencesApi,
} from "@/api/communicationPreferences.ts"
import { Checkbox } from "@/components/ui/checkbox.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"

type PrefRow = {
  kind: CommunicationPreferenceKind
  key: string
  title: string
  description?: string
  defaultInApp: boolean
  defaultEmail: boolean
}

const ROWS: PrefRow[] = [
  {
    kind: "notification",
    key: "overdue_maintenance",
    title: "Просроченное ТО",
    description:
      "Критичное уведомление, когда техника просрочила порог обслуживания.",
    defaultInApp: true,
    defaultEmail: false,
  },
  {
    kind: "notification",
    key: "expired_item",
    title: "Срок годности истёк (склад)",
    description: "Критично: есть просроченные товары на складе.",
    defaultInApp: true,
    defaultEmail: false,
  },
  {
    kind: "notification",
    key: "expiring_soon_item",
    title: "Срок годности скоро истечёт (склад)",
    description: "Важно: срок годности подходит к концу.",
    defaultInApp: true,
    defaultEmail: false,
  },
  {
    kind: "report",
    key: "weekly_summary",
    title: "Еженедельный отчёт (сводка)",
    description: "Сводка по ключевым событиям за неделю (email).",
    defaultInApp: false,
    defaultEmail: false,
  },
  {
    kind: "report",
    key: "monthly_maintenance",
    title: "Ежемесячный отчёт по ТО",
    description: "Сводка по обслуживанию техники за месяц (email).",
    defaultInApp: false,
    defaultEmail: false,
  },
]

function buildEffectiveValue(
  overrides: Map<string, { in_app_enabled: boolean; email_enabled: boolean }>,
  row: PrefRow,
) {
  const k = `${row.kind}:${row.key}`
  const o = overrides.get(k)
  return {
    inApp: o?.in_app_enabled ?? row.defaultInApp,
    email: o?.email_enabled ?? row.defaultEmail,
  }
}

export default function NotificationsAndReports() {
  const queryClient = useQueryClient()
  const { showSuccessToast } = useCustomToast()

  const { data, isLoading } = useQuery({
    queryKey: ["communication-preferences", "me"],
    queryFn: () => communicationPreferencesApi.listMine(),
  })

  const overrides = new Map(
    (data?.data ?? []).map((p) => [`${p.kind}:${p.key}`, p]),
  )

  const upsert = useMutation({
    mutationFn: (payload: {
      kind: CommunicationPreferenceKind
      key: string
      in_app_enabled: boolean
      email_enabled: boolean
    }) => communicationPreferencesApi.upsertMine(payload),
    onSuccess: async () => {
      showSuccessToast("Настройки уведомлений сохранены.")
      await queryClient.invalidateQueries({
        queryKey: ["communication-preferences"],
      })
      await queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
    onError: handleError,
  })

  const setValue = (
    row: PrefRow,
    next: { inApp?: boolean; email?: boolean },
  ) => {
    const cur = buildEffectiveValue(overrides, row)
    upsert.mutate({
      kind: row.kind,
      key: row.key,
      in_app_enabled: next.inApp ?? cur.inApp,
      email_enabled: next.email ?? cur.email,
    })
  }

  return (
    <div className="w-full max-w-full">
      <h2 className="py-4 text-lg font-medium">Уведомления и отчёты</h2>

      <p className="mb-4 text-sm text-muted-foreground">
        Выберите, какие события показывать в центре уведомлений и какие отчёты
        получать по email.
      </p>

      <div className="max-w-6xl overflow-hidden rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Тип</TableHead>
              <TableHead className="text-center">В приложении</TableHead>
              <TableHead className="text-center">Email</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((row) => {
              const v = buildEffectiveValue(overrides, row)
              return (
                <TableRow key={`${row.kind}:${row.key}`}>
                  <TableCell>
                    <p className="font-medium">{row.title}</p>
                    {row.description ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {row.description}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={v.inApp}
                        disabled={isLoading || upsert.isPending}
                        onCheckedChange={(c) =>
                          setValue(row, { inApp: Boolean(c) })
                        }
                      />
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex justify-center">
                      <Checkbox
                        checked={v.email}
                        disabled={isLoading || upsert.isPending}
                        onCheckedChange={(c) =>
                          setValue(row, { email: Boolean(c) })
                        }
                      />
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
