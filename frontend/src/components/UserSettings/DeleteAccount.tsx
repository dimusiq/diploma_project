import DeleteConfirmation from "./DeleteConfirmation.tsx"

const DeleteAccount = () => {
  return (
    <div className="w-full max-w-full space-y-4">
      <h2 className="py-4 text-lg font-medium">Удаление аккаунта</h2>
      <p className="text-sm text-muted-foreground">
        Безвозвратно удалить ваши данные и всё, что связано с аккаунтом.
      </p>
      <DeleteConfirmation />
    </div>
  )
}
export default DeleteAccount
