import { createFileRoute } from "@tanstack/react-router"

import Appearance from "@/components/UserSettings/Appearance.tsx"
import ChangePassword from "@/components/UserSettings/ChangePassword.tsx"
import DeleteAccount from "@/components/UserSettings/DeleteAccount.tsx"
import NotificationsAndReports from "@/components/UserSettings/NotificationsAndReports.tsx"
import UserInformation from "@/components/UserSettings/UserInformation.tsx"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs.tsx"
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
    <div className="w-full max-w-full px-4 py-6 md:px-6">
      <h1 className="py-6 text-center text-2xl font-semibold tracking-tight md:text-left">
        Настройки пользователя
      </h1>

      <Tabs defaultValue="my-profile" className="w-full">
        <TabsList
          variant="line"
          className="mb-6 h-auto w-full flex-wrap justify-start gap-1"
        >
          {finalTabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {finalTabs.map((tab) => (
          <TabsContent
            key={tab.value}
            value={tab.value}
            className="mt-0 outline-none"
          >
            <tab.component />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
