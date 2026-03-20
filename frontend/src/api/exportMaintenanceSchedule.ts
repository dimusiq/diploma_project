/**
 * Экспорт графика ТО в CSV или XLSX в стилистике приложения
 * (как экспорт товаров: заголовок с заливкой, границы, ширина колонок).
 */

import type { EquipmentPublic } from "@/api/equipment.ts"
import { EQUIPMENT_TYPE_LABELS } from "@/api/equipment.ts"

export type ScheduleStatus = "in_repair" | "overdue" | "due_soon" | "ok"

export interface MaintenanceScheduleRowExport {
  equipment: EquipmentPublic
  engineHours: number | null
  lastMaintenanceAtHours: number | null
  nextServiceAtHours: number | null
  status: ScheduleStatus
  primaryChainName: string
}

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  in_repair: "В ремонте",
  overdue: "Просрочено",
  due_soon: "Скоро",
  ok: "Норма",
}

const HEADERS = [
  "Техника",
  "Тип",
  "Гаражный номер",
  "Серийный номер",
  "Предыдущее ТО (м/ч)",
  "Моточасы",
  "След. ТО (м/ч)",
  "Осталось м/ч",
  "Последовательность ТО",
  "Статус",
]

function rowToCells(r: MaintenanceScheduleRowExport): (string | number)[] {
  const remaining =
    r.engineHours != null &&
    r.nextServiceAtHours != null &&
    r.engineHours < r.nextServiceAtHours
      ? r.nextServiceAtHours - r.engineHours
      : null
  return [
    `${r.equipment.brand_name ?? ""} ${r.equipment.model ?? ""}`.trim(),
    EQUIPMENT_TYPE_LABELS[r.equipment.equipment_type] ??
      r.equipment.equipment_type,
    r.equipment.garage_number ?? "—",
    r.equipment.serial_number ?? "—",
    r.lastMaintenanceAtHours ?? "—",
    r.engineHours ?? "—",
    r.nextServiceAtHours ?? "—",
    remaining != null
      ? remaining
      : r.status === "overdue" ||
          (r.engineHours != null &&
            r.nextServiceAtHours != null &&
            r.engineHours >= r.nextServiceAtHours)
        ? "0 (просрочено)"
        : "—",
    r.primaryChainName || "—",
    STATUS_LABELS[r.status],
  ]
}

/** Скачать график ТО как CSV с UTF-8 BOM для корректного отображения в Excel. */
export function downloadMaintenanceScheduleCsv(
  filteredRows: MaintenanceScheduleRowExport[],
): void {
  const rows = filteredRows.map(rowToCells)
  const csv = [
    HEADERS.map((h) => `"${h.replace(/"/g, '""')}"`).join(","),
    ...rows.map((row) =>
      row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\r\n")
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv; charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `график-то-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Скачать график ТО как XLSX со стилями (как в экспорте товаров). */
export async function downloadMaintenanceScheduleXlsx(
  filteredRows: MaintenanceScheduleRowExport[],
): Promise<void> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("График ТО", {
    views: [{ state: "frozen", ySplit: 1 }],
  })

  ws.addRow(HEADERS)
  for (const r of filteredRows) {
    ws.addRow(rowToCells(r))
  }

  const headerFill: import("exceljs").Fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF4472C4" },
  }
  const headerFont: Partial<import("exceljs").Font> = {
    bold: true,
    color: { argb: "FFFFFFFF" },
    size: 11,
  }
  const headerAlignment: Partial<import("exceljs").Alignment> = {
    horizontal: "center",
    vertical: "middle",
    wrapText: true,
  }
  const cellAlignment: Partial<import("exceljs").Alignment> = {
    vertical: "middle",
    wrapText: true,
  }
  const thinBorder: Partial<import("exceljs").Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  }

  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder
      cell.alignment = cellAlignment
      if (rowNumber === 1) {
        cell.fill = headerFill
        cell.font = headerFont
        cell.alignment = { ...cellAlignment, ...headerAlignment }
      }
    })
  })

  for (let colIdx = 1; colIdx <= HEADERS.length; colIdx++) {
    let maxLen = HEADERS[colIdx - 1]?.length ?? 10
    ws.eachRow({ includeEmpty: false }, (row) => {
      const cell = row.getCell(colIdx)
      const val = cell.value
      const len = val != null ? String(val).length : 0
      if (len > maxLen) maxLen = len
    })
    ws.getColumn(colIdx).width = Math.min(50, Math.max(maxLen + 2, 12))
  }

  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `график-то-${new Date().toISOString().slice(0, 10)}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
