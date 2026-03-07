import {
  Box,
  Button,
  Container,
  Flex,
  Heading,
  Input,
  Text,
} from "@chakra-ui/react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { type SubmitHandler, useForm } from "react-hook-form"

import {
  type ApiError,
  type UserPublic,
  UsersService,
  type UserUpdateMe,
} from "@/client/index.ts"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"
import useCustomToast from "@/hooks/useCustomToast.ts"
import { emailPattern, handleError } from "@/utils.ts"
import { Field } from "../ui/field.tsx"

const UserInformation = () => {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { showSuccessToast } = useCustomToast()
  const [editMode, setEditMode] = useState(false)
  const currentUser = useCurrentUser()
  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting, errors, isDirty },
  } = useForm<UserPublic>({
    mode: "onBlur",
    criteriaMode: "all",
    defaultValues: {
      full_name: currentUser.full_name,
      email: currentUser.email,
    },
  })

  const toggleEditMode = () => {
    setEditMode(!editMode)
  }

  const mutation = useMutation({
    mutationFn: (data: UserUpdateMe) =>
      UsersService.updateUserMe({ requestBody: data }),
    onSuccess: async () => {
      showSuccessToast("Пользователь успешно обновлен.")
      queryClient.invalidateQueries({ queryKey: ["currentUser"] })
      await router.invalidate()
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const onSubmit: SubmitHandler<UserUpdateMe> = async (data) => {
    mutation.mutate(data)
  }

  const onCancel = () => {
    reset()
    toggleEditMode()
  }

  return (
    <Container maxW="full">
      <Heading size="sm" py={4}>
        Информация о пользователе
      </Heading>
      <Box
        w={{ sm: "full", md: "sm" }}
        as="form"
        onSubmit={handleSubmit(onSubmit)}
      >
        <Field label="Полное имя">
          {editMode ? (
            <Input
              {...register("full_name", { maxLength: 30 })}
              type="text"
              size="md"
            />
          ) : (
            <Text
              fontSize="md"
              py={2}
              color={!currentUser.full_name ? "gray" : "inherit"}
              truncate
              maxW="sm"
            >
              {currentUser.full_name || "N/A"}
            </Text>
          )}
        </Field>
        <Field
          mt={4}
          label="Email"
          invalid={!!errors.email}
          errorText={errors.email?.message}
        >
          {editMode ? (
            <Input
              {...register("email", {
                required: "Email is required",
                pattern: emailPattern,
              })}
              type="email"
              size="md"
            />
          ) : (
            <Text fontSize="md" py={2} truncate maxW="sm">
              {currentUser.email}
            </Text>
          )}
        </Field>
        <Flex mt={4} gap={3}>
          <Button
            variant="solid"
            size="sm"
            onClick={toggleEditMode}
            type={editMode ? "button" : "submit"}
            loading={editMode ? isSubmitting : false}
            disabled={editMode ? !isDirty || !getValues("email") : false}
          >
            {editMode ? "Сохранить" : "Изменить"}
          </Button>
          {editMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={onCancel}
              disabled={isSubmitting}
            >
              Отмена
            </Button>
          )}
        </Flex>
      </Box>
    </Container>
  )
}

export default UserInformation
