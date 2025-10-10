import {
  useMutation,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Controller,
  type SubmitHandler,
  useForm,
} from 'react-hook-form';

import { type UserCreate, UsersService } from '@/client';
import type { ApiError } from '@/client/core/ApiError';
import useCustomToast from '@/hooks/useCustomToast';
import { emailPattern, handleError } from '@/utils';
import {
  Button,
  DialogActionTrigger,
  DialogTitle,
  Flex,
  Input,
  Text,
  VStack,
} from '@chakra-ui/react';
import { useState } from 'react';
import { FaPlus } from 'react-icons/fa';
import { Checkbox } from '../ui/checkbox';
import {
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTrigger,
} from '../ui/dialog';
import { Field } from '../ui/field';

interface UserCreateForm extends UserCreate {
  confirm_password: string;
}

const AddUser = () => {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();
  const { showSuccessToast } = useCustomToast();
  const {
    control,
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isValid, isSubmitting },
  } = useForm<UserCreateForm>({
    mode: 'onBlur',
    criteriaMode: 'all',
    defaultValues: {
      email: '',
      full_name: '',
      password: '',
      confirm_password: '',
      is_superuser: false,
      is_active: false,
    },
  });

  const mutation = useMutation({
    mutationFn: (data: UserCreate) =>
      UsersService.createUser({ requestBody: data }),
    onSuccess: () => {
      showSuccessToast('Пользователь успешно создан.');
      reset();
      setIsOpen(false);
    },
    onError: (err: ApiError) => {
      handleError(err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['users'],
      });
    },
  });

  const onSubmit: SubmitHandler<UserCreateForm> = (
    data
  ) => {
    mutation.mutate(data);
  };

  return (
    <DialogRoot
      size={{ base: 'xs', md: 'md' }}
      placement='center'
      open={isOpen}
      onOpenChange={({ open }) => setIsOpen(open)}
    >
      <DialogTrigger asChild>
        <Button value='add-user' my={4}>
          <FaPlus fontSize='16px' />
          Добавить пользователя
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Добавить пользователя</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <Text mb={4}>
              Заполните форму для создания нового
              пользователя. Все поля обязательны для
              заполнения.
            </Text>
            <VStack gap={4}>
              <Field
                required
                invalid={!!errors.email}
                errorText={errors.email?.message}
                label='Email'
              >
                <Input
                  id='email'
                  {...register('email', {
                    required: 'Email обязателен',
                    pattern: emailPattern,
                  })}
                  placeholder='Email'
                  type='email'
                />
              </Field>

              <Field
                invalid={!!errors.full_name}
                errorText={errors.full_name?.message}
                label='Полное имя'
              >
                <Input
                  id='name'
                  {...register('full_name')}
                  placeholder='Полное имя'
                  type='text'
                />
              </Field>

              <Field
                required
                invalid={!!errors.password}
                errorText={errors.password?.message}
                label='Укажите пароль'
              >
                <Input
                  id='password'
                  {...register('password', {
                    required: 'Пароль обязателен',
                    minLength: {
                      value: 8,
                      message:
                        'Пароль должен содержать не менее 8 символов',
                    },
                  })}
                  placeholder='Пароль'
                  type='password'
                />
              </Field>

              <Field
                required
                invalid={!!errors.confirm_password}
                errorText={errors.confirm_password?.message}
                label='Подтвердите пароль'
              >
                <Input
                  id='confirm_password'
                  {...register('confirm_password', {
                    required:
                      'Пожалуйста, подтвердите пароль',
                    validate: (value) =>
                      value === getValues().password ||
                      'Пароли не совпадают',
                  })}
                  placeholder='Пароль'
                  type='password'
                />
              </Field>
            </VStack>

            <Flex mt={4} direction='column' gap={4}>
              <Controller
                control={control}
                name='is_superuser'
                render={({ field }) => (
                  <Field
                    disabled={field.disabled}
                    colorPalette='cyan'
                  >
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={({ checked }) =>
                        field.onChange(checked)
                      }
                    >
                      Суперпользователь?
                    </Checkbox>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name='is_active'
                render={({ field }) => (
                  <Field
                    disabled={field.disabled}
                    colorPalette='cyan'
                  >
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={({ checked }) =>
                        field.onChange(checked)
                      }
                    >
                      Активный?
                    </Checkbox>
                  </Field>
                )}
              />
            </Flex>
          </DialogBody>

          <DialogFooter gap={2}>
            <DialogActionTrigger asChild>
              <Button
                variant='subtle'
                colorPalette='gray'
                disabled={isSubmitting}
              >
                Отменить
              </Button>
            </DialogActionTrigger>
            <Button
              variant='solid'
              type='submit'
              disabled={!isValid}
              loading={isSubmitting}
            >
              Сохранить
            </Button>
          </DialogFooter>
        </form>
        <DialogCloseTrigger />
      </DialogContent>
    </DialogRoot>
  );
};

export default AddUser;
