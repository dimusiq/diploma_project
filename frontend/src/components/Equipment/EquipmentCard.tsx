/**
 * Карточка техники — центр эксплуатации: вкладки Паспорт / ТО / Ремонты / Документы / История + QR-код.
 */
import {
  Box,
  Button,
  Flex,
  Heading,
  Table,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"
import { useQuery } from "@tanstack/react-query"
import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { equipmentApi } from "@/api/equipment.ts"
import { auditApi } from "@/api/audit.ts"
import type { EquipmentPublic } from "@/api/equipment.ts"
import { EquipmentFormDialog } from "@/components/Equipment/EquipmentFormDialog.tsx"
import { EquipmentRecordMaintenanceDialog } from "@/components/Equipment/EquipmentRecordMaintenanceDialog.tsx"

const TAB_KEYS = ["passport", "maintenance", "repairs", "documents", "history"] as const
type TabKey = (typeof TAB_KEYS)[number]

const TAB_LABELS: Record<TabKey, string> = {
  passport: "Паспорт",
  maintenance: "ТО",
  repairs: "Ремонты",
  documents: "Документы",
  history: "История",
}

function parseAttachments(attachments: string | null): string[] {
  if (!attachments?.trim()) return []
  try {
    const v = JSON.parse(attachments)
    return Array.isArray(v) ? v : [attachments]
  } catch {
    return attachments.split(/\n/).map((s) => s.trim()).filter(Boolean)
  }
}

export function EquipmentCard({
  equipmentId,
  initialTab = "passport",
  onBack,
}: {
  equipmentId: string
  initialTab?: TabKey
  onBack: () => void
}) {
  const [tab, setTab] = useState<TabKey>(initialTab)
  const [recordMaintenanceOpen, setRecordMaintenanceOpen] = useState(false)

  const { data: equipment, isLoading, error } = useQuery({
    queryKey: ["equipment", equipmentId],
    queryFn: () => equipmentApi.get(equipmentId),
  })

  const cardUrl =
    typeof window !== "undefined" ? window.location.href : ""

  if (isLoading) {
    return (
      <Box>
        <Text color="fg.muted">Загрузка...</Text>
      </Box>
    )
  }
  if (error || !equipment) {
    return (
      <Box>
        <Text color="red">Техника не найдена</Text>
        <Button size="sm" variant="outline" mt={2} onClick={onBack}>
          Назад
        </Button>
      </Box>
    )
  }

  return (
    <Box>
      <Flex
        gap={4}
        mb={6}
        flexWrap="wrap"
        align="flex-start"
        justify="space-between"
      >
        <Flex gap={3} align="center" flexWrap="wrap">
          <Button size="sm" variant="ghost" onClick={onBack}>
            ← Назад
          </Button>
          <Heading size="lg">
            {equipment.brand_name} {equipment.model}
          </Heading>
          {equipment.garage_number && (
            <Text fontSize="sm" color="fg.muted">
              Гар. № {equipment.garage_number}
            </Text>
          )}
        </Flex>
        {cardUrl && (
          <Flex
            align="center"
            gap={2}
            p={2}
            bg="bg.subtle"
            borderRadius="md"
            title="Отсканируйте для открытия карточки на другом устройстве"
          >
            <QRCodeSVG value={cardUrl} size={80} level="M" />
            <Text fontSize="xs" color="fg.muted" maxW="120px">
              QR-код карточки
            </Text>
          </Flex>
        )}
      </Flex>

      <Tabs.Root
        value={tab}
        onValueChange={(e) => setTab(e.value as TabKey)}
        variant="subtle"
      >
        <Tabs.List mb={4}>
          {TAB_KEYS.map((key) => (
            <Tabs.Trigger key={key} value={key}>
              {TAB_LABELS[key]}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="passport">
          <EquipmentFormDialog
            open={true}
            onOpenChange={(open) => !open && onBack()}
            editItem={equipment}
            asPage
          />
        </Tabs.Content>

        <Tabs.Content value="maintenance">
          <MaintenanceTab equipment={equipment} onRecordOpen={() => setRecordMaintenanceOpen(true)} />
        </Tabs.Content>

        <Tabs.Content value="repairs">
          <Box p={4} bg="bg.subtle" borderRadius="md">
            <Text color="fg.muted">
              Раздел «Ремонты» в разработке. Пока учёт ремонтов ведётся через вкладку «ТО» и журнал обслуживания.
            </Text>
          </Box>
        </Tabs.Content>

        <Tabs.Content value="documents">
          <DocumentsTab equipment={equipment} />
        </Tabs.Content>

        <Tabs.Content value="history">
          <HistoryTab equipmentId={equipmentId} />
        </Tabs.Content>
      </Tabs.Root>

      <EquipmentRecordMaintenanceDialog
        equipment={equipment}
        open={recordMaintenanceOpen}
        onOpenChange={setRecordMaintenanceOpen}
        onSuccess={() => {}}
      />
    </Box>
  )
}

function MaintenanceTab({
  equipment,
  onRecordOpen,
}: {
  equipment: EquipmentPublic
  onRecordOpen: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["equipment-maintenance-records", equipment.id],
    queryFn: () => equipmentApi.maintenanceRecords(equipment.id),
  })
  const records = data?.data ?? []

  return (
    <Box>
      <Flex justify="flex-end" mb={3}>
        <Button size="sm" variant="outline" onClick={onRecordOpen}>
          Записать проведённое ТО
        </Button>
      </Flex>
      {isLoading && <Text color="fg.muted">Загрузка…</Text>}
      {!isLoading && records.length === 0 && (
        <Text color="fg.muted">
          Проведённых ТО по этой единице техники пока нет.
        </Text>
      )}
      {!isLoading && records.length > 0 && (
        <Table.Root size="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Дата</Table.ColumnHeader>
              <Table.ColumnHeader>Интервал (м/ч)</Table.ColumnHeader>
              <Table.ColumnHeader>Моточасы на момент ТО</Table.ColumnHeader>
              <Table.ColumnHeader>Комментарий</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {records.map((r) => (
              <Table.Row key={r.id}>
                <Table.Cell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </Table.Cell>
                <Table.Cell>{r.interval_hours}</Table.Cell>
                <Table.Cell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </Table.Cell>
                <Table.Cell>{r.comment ?? "—"}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Box>
  )
}

function DocumentsTab({ equipment }: { equipment: EquipmentPublic }) {
  const attachments = parseAttachments(equipment.attachments)
  const hasInstructions = !!equipment.instructions?.trim()

  if (attachments.length === 0 && !hasInstructions) {
    return (
      <Box p={4} bg="bg.subtle" borderRadius="md">
        <Text color="fg.muted">
          Документы и ссылки можно добавить в паспорте техники (поле «Фото / документация» и «Инструкции»).
        </Text>
      </Box>
    )
  }

  return (
    <VStack align="stretch" gap={4}>
      {attachments.length > 0 && (
        <Box>
          <Text fontWeight="medium" mb={2}>
            Ссылки на фото / документацию
          </Text>
          <VStack align="stretch" gap={1}>
            {attachments.map((url, i) => (
              <a
                key={i}
                href={url.startsWith("http") ? url : `https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--chakra-colors-blue-500)", fontSize: "14px" }}
              >
                {url}
              </a>
            ))}
          </VStack>
        </Box>
      )}
      {hasInstructions && (
        <Box>
          <Text fontWeight="medium" mb={2}>
            Инструкции по эксплуатации
          </Text>
          <Text whiteSpace="pre-wrap" fontSize="sm">
            {equipment.instructions}
          </Text>
        </Box>
      )}
    </VStack>
  )
}

function HistoryTab({ equipmentId }: { equipmentId: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["audit", "equipment", equipmentId],
    queryFn: () =>
      auditApi.list({
        resource_type: "equipment",
        resource_id: equipmentId,
        limit: 50,
      }),
  })

  const rows = data?.data ?? []

  if (isLoading) return <Text color="fg.muted">Загрузка…</Text>
  if (isError) return <Text color="fg.muted">Не удалось загрузить историю.</Text>
  if (rows.length === 0) {
    return (
      <Box p={4} bg="bg.subtle" borderRadius="md">
        <Text color="fg.muted">
          Записей об изменениях по этой технике пока нет.
        </Text>
      </Box>
    )
  }

  return (
    <Table.Root size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Дата и время</Table.ColumnHeader>
          <Table.ColumnHeader>Действие</Table.ColumnHeader>
          <Table.ColumnHeader>Пользователь</Table.ColumnHeader>
          <Table.ColumnHeader>Детали</Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {rows.map((r) => (
          <Table.Row key={r.id}>
            <Table.Cell whiteSpace="nowrap" fontSize="xs">
              {r.created_at
                ? new Date(r.created_at).toLocaleString("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </Table.Cell>
            <Table.Cell>{r.action}</Table.Cell>
            <Table.Cell>{r.user_email ?? "—"}</Table.Cell>
            <Table.Cell maxW="200px" truncate title={r.details ?? undefined}>
              {r.details ?? "—"}
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  )
}
