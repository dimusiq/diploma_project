import DeleteConfirmation from "./DeleteConfirmation.tsx"

const DeleteAccount = () => {
  return (
    <div className="w-full max-w-full space-y-4">
      <h2 className="py-4 text-lg font-medium">Delete Account</h2>
      <p className="text-sm text-muted-foreground">
        Permanently delete your data and everything associated with your
        account.
      </p>
      <DeleteConfirmation />
    </div>
  )
}
export default DeleteAccount
