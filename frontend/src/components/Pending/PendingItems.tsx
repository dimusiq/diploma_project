import { Table } from '@chakra-ui/react';
import { SkeletonText } from '../ui/skeleton';

const PendingItems = () => (
  <Table.Root size={{ base: 'sm', md: 'md' }}>
    <Table.Header>
      <Table.Row>
        <Table.ColumnHeader w='xs' />
        <Table.ColumnHeader w='sm'>ID</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Название</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Описание</Table.ColumnHeader>
        <Table.ColumnHeader w='xs'>Кол-во</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Артикул</Table.ColumnHeader>
        <Table.ColumnHeader w='xs'>Ед.</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Категория</Table.ColumnHeader>
        <Table.ColumnHeader w='sm'>Действия</Table.ColumnHeader>
      </Table.Row>
    </Table.Header>
    <Table.Body>
      {[...Array(5)].map((_, index) => (
        <Table.Row key={index}>
          <Table.Cell><SkeletonText noOfLines={1} w={4} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
          <Table.Cell><SkeletonText noOfLines={1} /></Table.Cell>
        </Table.Row>
      ))}
    </Table.Body>
  </Table.Root>
);

export default PendingItems;
