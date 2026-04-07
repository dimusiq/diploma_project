import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useState } from "react"

import {
  type Body_login_login_access_token as AccessToken,
  type ApiError,
  LoginService,
  type UserPublic,
  type UserRegister,
  UsersService,
} from "@/client/index.ts"
import {
  hasAccessToken,
  removeAccessToken,
  setAccessToken,
} from "@/lib/authStorage.ts"
import { handleError } from "@/utils.ts"

const isLoggedIn = () => hasAccessToken()

const useAuth = () => {
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: user, dataUpdatedAt } = useQuery<UserPublic | null, Error>({
    queryKey: ["currentUser"],
    queryFn: UsersService.readUserMe,
    enabled: isLoggedIn(),
  })

  const signUpMutation = useMutation({
    mutationFn: (data: UserRegister) =>
      UsersService.registerUser({ requestBody: data }),

    onSuccess: () => {
      navigate({ to: "/login" })
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["users"],
      })
    },
  })

  const login = async (data: AccessToken & { remember?: boolean }) => {
    const response = await LoginService.loginAccessToken({
      formData: data,
    })
    setAccessToken(response.access_token, data.remember ?? false)
  }

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      navigate({ to: "/" })
    },
    onError: (err: ApiError) => {
      handleError(err)
    },
  })

  const logout = () => {
    removeAccessToken()
    navigate({ to: "/login" })
  }

  return {
    signUpMutation,
    loginMutation,
    logout,
    user,
    /** Меняется при refetch профиля — для сброса кэша blob URL аватара */
    userDataUpdatedAt: dataUpdatedAt,
    error,
    resetError: () => setError(null),
  }
}

export { isLoggedIn }
export default useAuth
