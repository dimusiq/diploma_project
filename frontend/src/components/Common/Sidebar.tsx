import {
  Box,
  Flex,
  IconButton,
  Text,
} from '@chakra-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FaBars } from 'react-icons/fa';
import { FiLogOut } from 'react-icons/fi';

import type { UserPublic } from '@/client';
import useAuth from '@/hooks/useAuth';
import {
  DrawerBackdrop,
  DrawerBody,
  DrawerCloseTrigger,
  DrawerContent,
  DrawerRoot,
  DrawerTrigger,
} from '../ui/drawer';
import SidebarItems from './SidebarItems';

const Sidebar = () => {
  const queryClient = useQueryClient();
  const currentUser = queryClient.getQueryData<UserPublic>([
    'currentUser',
  ]);
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Mobile */}
      <DrawerRoot
        placement='start'
        open={open}
        onOpenChange={(e) => setOpen(e.open)}
      >
        <DrawerBackdrop />
        <DrawerTrigger asChild>
          <IconButton
            variant='ghost'
            color='inherit'
            display={{ base: 'flex', md: 'none' }}
            aria-label='Open Menu'
            position='absolute'
            zIndex='100'
            m={4}
          >
            <FaBars />
          </IconButton>
        </DrawerTrigger>
        <DrawerContent maxW='xs'>
          <DrawerCloseTrigger />
          <DrawerBody overflow='hidden' display='flex' flexDir='column' p={0}>
            <Box flex='1' minH={0} overflowY='auto' overflowX='hidden' px={4} pt={4} pb={4}>
              <SidebarItems onClose={() => setOpen(false)} />
              <Flex
                as='button'
                onClick={() => {
                  logout();
                }}
                alignItems='center'
                gap={4}
                px={4}
                py={2}
              >
                <FiLogOut />
                <Text>Выйти</Text>
              </Flex>
            </Box>
            {currentUser?.email && (
              <Text
                fontSize='sm'
                p={4}
                truncate
                maxW='sm'
                flexShrink={0}
              >
                Logged in as: {currentUser.email}
              </Text>
            )}
          </DrawerBody>
          <DrawerCloseTrigger />
        </DrawerContent>
      </DrawerRoot>

      {/* Desktop */}

      <Box
        display={{ base: 'none', md: 'flex' }}
        flexDir='column'
        w='xs'
        maxW='xs'
        flexShrink={0}
        minH={0}
        bg='bg.subtle'
        overflow='hidden'
      >
        <Box h='100%' minH={0} overflowY='auto' overflowX='hidden' w='100%' p={4}>
          <SidebarItems />
        </Box>
      </Box>
    </>
  );
};

export default Sidebar;
