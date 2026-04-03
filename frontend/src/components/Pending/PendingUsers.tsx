import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.tsx"
import { SkeletonText } from "../ui/skeleton.tsx"

const PendingUsers = () => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead className="w-32">Полное имя</TableHead>
        <TableHead className="w-32">Email</TableHead>
        <TableHead className="w-32">Role</TableHead>
        <TableHead className="w-32">Статус</TableHead>
        <TableHead className="w-32">Действия</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {[...Array(5)].map((_, index) => (
        <TableRow key={index}>
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

export default PendingUsers
