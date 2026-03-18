import { Box, Container, Heading, HStack, Table, Text } from "@chakra-ui/react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  communicationPreferencesApi,
  type CommunicationPreferenceKind,
} from "@/api/communicationPreferences.ts"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { handleError } from "@/utils.ts"
import { Checkbox } from "../ui/checkbox.tsx"

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
    description: "Критичное уведомление, когда техника просрочила порог обслуживания.",
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
      // Обновим бейдж/список уведомлений, если пользователь отключал типы
      await queryClient.invalidateQueries({ queryKey: ["notifications"] })
    },
    onError: handleError,
  })

  const setValue = (row: PrefRow, next: { inApp?: boolean; email?: boolean }) => {
    const cur = buildEffectiveValue(overrides, row)
    upsert.mutate({
      kind: row.kind,
      key: row.key,
      in_app_enabled: next.inApp ?? cur.inApp,
      email_enabled: next.email ?? cur.email,
    })
  }

  return (
    <Container maxW="full">
      <Heading size="sm" py={4}>
        Уведомления и отчёты
      </Heading>

      <Text color="fg.muted" fontSize="sm" mb={4}>
        Выберите, какие события показывать в центре уведомлений и какие отчёты получать по email.
      </Text>

      <Box
        borderWidth="1px"
        borderColor="border"
        borderRadius="md"
        overflow="hidden"
        maxW="6xl"
      >
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Тип</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="center">В приложении</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="center">Email</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {ROWS.map((row) => {
              const v = buildEffectiveValue(overrides, row)
              return (
                <Table.Row key={`${row.kind}:${row.key}`}>
                  <Table.Cell>
                    <Text fontWeight="medium">{row.title}</Text>
                    {row.description && (
                      <Text fontSize="xs" color="fg.muted" mt={1}>
                        {row.description}
                      </Text>
                    )}
                  </Table.Cell>
                  <Table.Cell textAlign="center">
                    <HStack justify="center">
                      <Checkbox
                        checked={v.inApp}
                        disabled={isLoading || upsert.isPending}
                        onCheckedChange={({ checked }) =>
                          setValue(row, { inApp: Boolean(checked) })
                        }
                      />
                    </HStack>
                  </Table.Cell>
                  <Table.Cell textAlign="center">
                    <HStack justify="center">
                      <Checkbox
                        checked={v.email}
                        disabled={isLoading || upsert.isPending}
                        onCheckedChange={({ checked }) =>
                          setValue(row, { email: Boolean(checked) })
                        }
                      />
                    </HStack>
                  </Table.Cell>
                </Table.Row>
              )
            })}
          </Table.Body>
        </Table.Root>
      </Box>
    </Container>
  )
}

