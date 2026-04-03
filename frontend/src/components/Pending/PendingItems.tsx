import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { SkeletonText } from "../ui/skeleton.tsx"

const PendingItems = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-20" />
        <TableHead className="w-32">ID</TableHead>
        <TableHead className="w-32">Название</TableHead>
        <TableHead className="w-32">Описание</TableHead>
        <TableHead className="w-20">Кол-во</TableHead>
        <TableHead className="w-32">Артикул</TableHead>
        <TableHead className="w-20">Ед.</TableHead>
        <TableHead className="w-32">Категория</TableHead>
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
        </TableRow>
      ))}
    </TableBody>
  </Table>
)

export default PendingItems
