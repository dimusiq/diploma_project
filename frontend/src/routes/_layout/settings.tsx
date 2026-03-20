import { Container, Heading, Tabs } from "@chakra-ui/react"
import { createFileRoute } from "@tanstack/react-router"

import Appearance from "@/components/UserSettings/Appearance.tsx"
import ChangePassword from "@/components/UserSettings/ChangePassword.tsx"
import DeleteAccount from "@/components/UserSettings/DeleteAccount.tsx"
import NotificationsAndReports from "@/components/UserSettings/NotificationsAndReports.tsx"
import UserInformation from "@/components/UserSettings/UserInformation.tsx"
import { useCurrentUser } from "@/contexts/CurrentUserContext.tsx"

const tabsConfig = [
  { value: "my-profile", title: "Мой профиль", component: UserInformation },
  { value: "password", title: "Пароль", component: ChangePassword },
  {
    value: "notifications",
    title: "Уведомления и отчёты",
    component: NotificationsAndReports,
  },
  { value: "appearance", title: "Настройка темы", component: Appearance },
  { value: "danger-zone", title: "Опасная зона", component: DeleteAccount },
]

export const Route = createFileRoute("/_layout/settings")({
  component: UserSettings,
})

function UserSettings() {
  const currentUser = useCurrentUser()
  const finalTabs = currentUser.is_superuser
    ? tabsConfig
    : tabsConfig.filter((tab) => tab.value !== "danger-zone")

  return (
    <Container maxW="full">
      <Heading size="lg" textAlign={{ base: "center", md: "left" }} py={12}>
        Настройки пользователя
      </Heading>

      <Tabs.Root defaultValue="my-profile" variant="subtle">
        <Tabs.List>
          {finalTabs.map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value}>
              {tab.title}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {finalTabs.map((tab) => (
          <Tabs.Content key={tab.value} value={tab.value}>
            <tab.component />
          </Tabs.Content>
        ))}
      </Tabs.Root>
    </Container>
  )
}
