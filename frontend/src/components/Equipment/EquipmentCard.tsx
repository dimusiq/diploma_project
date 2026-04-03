/**
 * Карточка техники — центр эксплуатации: вкладки Паспорт / ТО / Ремонты / Документы / История + QR-код.
 */

import { useQuery } from "@tanstack/react-query"
import { QRCodeSVG } from "qrcode.react"
import { useState } from "react"
import { auditApi } from "@/api/audit.ts"
import type { EquipmentPublic } from "@/api/equipment.ts"
import { equipmentApi } from "@/api/equipment.ts"
import { EquipmentFormDialog } from "@/components/Equipment/EquipmentFormDialog.tsx"
import { EquipmentRecordMaintenanceDialog } from "@/components/Equipment/EquipmentRecordMaintenanceDialog.tsx"
import { Button } from "@/components/ui/button.tsx"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"

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
      <div>
        <p className="text-sm text-muted-foreground">Загрузка...</p>
      </div>
    )
  }
  if (error || !equipment) {
    return (
      <div>
        <p className="text-destructive">Техника не найдена</p>
        <Button size="sm" variant="outline" className="mt-2" onClick={onBack}>
          Назад
        </Button>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" variant="ghost" onClick={onBack}>
            ← Назад
          </Button>
          <h2 className="font-heading text-xl font-semibold tracking-tight md:text-2xl">
            {equipment.brand_name} {equipment.model}
          </h2>
          {equipment.garage_number && (
            <p className="text-sm text-muted-foreground">
              Гар. № {equipment.garage_number}
            </p>
          )}
        </div>
        {cardUrl && (
          <div
            className="flex items-center gap-2 rounded-md bg-muted/50 p-2"
            title="Отсканируйте для открытия карточки на другом устройстве"
          >
            <QRCodeSVG value={cardUrl} size={80} level="M" />
            <p className="max-w-[120px] text-xs text-muted-foreground">
              QR-код карточки
            </p>
          </div>
        )}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as TabKey)}
        className="w-full"
      >
        <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-1 bg-muted/60">
          {TAB_KEYS.map((key) => (
            <TabsTrigger key={key} value={key}>
              {TAB_LABELS[key]}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="passport" className="mt-0 outline-none">
          <EquipmentFormDialog
            open={true}
            onOpenChange={(open) => !open && onBack()}
            editItem={equipment}
            asPage
          />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-0 outline-none">
          <MaintenanceTab equipment={equipment} onRecordOpen={() => setRecordMaintenanceOpen(true)} />
        </TabsContent>

        <TabsContent value="repairs" className="mt-0 outline-none">
          <div className="rounded-md bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">
              Раздел «Ремонты» в разработке. Пока учёт ремонтов ведётся через вкладку «ТО» и журнал обслуживания.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="documents" className="mt-0 outline-none">
          <DocumentsTab equipment={equipment} />
        </TabsContent>

        <TabsContent value="history" className="mt-0 outline-none">
          <HistoryTab equipmentId={equipmentId} />
        </TabsContent>
      </Tabs>

      <EquipmentRecordMaintenanceDialog
        equipment={equipment}
        open={recordMaintenanceOpen}
        onOpenChange={setRecordMaintenanceOpen}
        onSuccess={() => {}}
      />
    </div>
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
    <div>
      <div className="mb-3 flex justify-end">
        <Button size="sm" variant="outline" onClick={onRecordOpen}>
          Записать проведённое ТО
        </Button>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
      {!isLoading && records.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Проведённых ТО по этой единице техники пока нет.
        </p>
      )}
      {!isLoading && records.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Дата</TableHead>
              <TableHead>Интервал (м/ч)</TableHead>
              <TableHead>Моточасы на момент ТО</TableHead>
              <TableHead>Комментарий</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  {new Date(r.performed_at).toLocaleDateString("ru-RU")}
                </TableCell>
                <TableCell>{r.interval_hours}</TableCell>
                <TableCell>
                  {r.engine_hours_at_service != null
                    ? r.engine_hours_at_service
                    : "—"}
                </TableCell>
                <TableCell>{r.comment ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

function DocumentsTab({ equipment }: { equipment: EquipmentPublic }) {
  const attachments = parseAttachments(equipment.attachments)
  const hasInstructions = !!equipment.instructions?.trim()

  if (attachments.length === 0 && !hasInstructions) {
    return (
      <div className="rounded-md bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">
          Документы и ссылки можно добавить в паспорте техники (поле «Фото / документация» и «Инструкции»).
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {attachments.length > 0 && (
        <div>
          <p className="mb-2 font-medium">Ссылки на фото / документацию</p>
          <div className="flex flex-col gap-1">
            {attachments.map((url, i) => (
              <a
                key={i}
                href={url.startsWith("http") ? url : `https://${url}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline-offset-4 hover:underline"
              >
                {url}
              </a>
            ))}
          </div>
        </div>
      )}
      {hasInstructions && (
        <div>
          <p className="mb-2 font-medium">Инструкции по эксплуатации</p>
          <p className="whitespace-pre-wrap text-sm">{equipment.instructions}</p>
        </div>
      )}
    </div>
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

  if (isLoading) return <p className="text-sm text-muted-foreground">Загрузка…</p>
  if (isError) return <p className="text-sm text-muted-foreground">Не удалось загрузить историю.</p>
  if (rows.length === 0) {
    return (
      <div className="rounded-md bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">
          Записей об изменениях по этой технике пока нет.
        </p>
      </div>
    )
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Дата и время</TableHead>
          <TableHead>Действие</TableHead>
          <TableHead>Пользователь</TableHead>
          <TableHead>Детали</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="whitespace-nowrap text-xs">
              {r.created_at
                ? new Date(r.created_at).toLocaleString("ru-RU", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })
                : "—"}
            </TableCell>
            <TableCell>{r.action}</TableCell>
            <TableCell>{r.user_email ?? "—"}</TableCell>
            <TableCell className="max-w-[200px] truncate" title={r.details ?? undefined}>
              {r.details ?? "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
