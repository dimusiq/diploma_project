import { Table } from '@chakra-ui/react';
import { SkeletonText } from '../ui/skeleton';

const PendingUsers = () => (
  <Table.Root size={{ base: 'sm', md: 'md' }}>
    <Table.Header>
      <Table.Row>
        <Table.ColumnHeader w='sm'>
          Полное имя
        </Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>
          Email
        </Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Role</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>
          Статус
        </Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>
          Действия
        </Table.ColumnHeader>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {[...Array(5)].map((_, index) => (
        <Table.Row key={index}>
          <Table.Cell>
            <SkeletonText noOfLines={1} />
          </Table.Cell>
          <Table.Cell>
            <SkeletonText noOfLines={1} />
          </Table.Cell>
          <Table.Cell>
            <SkeletonText noOfLines={1} />
          </Table.Cell>
          <Table.Cell>
            <SkeletonText noOfLines={1} />
          </Table.Cell>
          <Table.Cell>
            <SkeletonText noOfLines={1} />
          </Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  </Table.Root>
);

export default PendingUsers;
