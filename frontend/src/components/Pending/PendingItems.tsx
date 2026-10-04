import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { SkeletonText } from "../ui/skeleton.tsx"

/**
 * Скелетон таблицы товаров — колонки совпадают с ItemDataTable
 * (чекбокс + название + описание + кол-во + доступно + резерв + артикул + ед. + категория + дата + действия).
 */
const PendingItems = () => (
  <div className="overflow-x-auto">
    <Table className="min-w-[800px]">
      <TableHeader>
        <TableRow>
          <TableHead className="w-24" />
          <TableHead className="w-40">Название</TableHead>
          <TableHead className="w-40">Описание</TableHead>
          <TableHead className="w-20">Кол-во</TableHead>
          <TableHead className="w-28">Доступно</TableHead>
          <TableHead className="w-28">Резерв</TableHead>
          <TableHead className="w-32">Артикул</TableHead>
          <TableHead className="w-20">Ед.</TableHead>
          <TableHead className="w-32">Категория</TableHead>
          <TableHead className="w-32">Дата</TableHead>
          <TableHead className="w-32">Действия</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[...Array(5)].map((_, index) => (
          <TableRow key={index}>
            <TableCell>
              <SkeletonText noOfLines={1} w={16} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
            <TableCell>
              <SkeletonText noOfLines={1} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  </div>
)

export default PendingItems
