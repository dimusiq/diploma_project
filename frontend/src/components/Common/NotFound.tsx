import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button.tsx"

const NotFound = () => {
  return (
    <div
      className="flex min-h-screen flex-col bg-background text-foreground"
      data-testid="not-found"
    >
      <header className="border-b border-border px-4 py-3">
        <Link
          to="/"
          className="font-heading text-lg font-semibold tracking-tight text-foreground"
        >
          Склад
        </Link>
      </header>
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-4">
        <h1 className="text-6xl leading-none font-bold md:text-8xl">404</h1>
        <p className="text-2xl font-bold">Ошибка!</p>
        <p className="max-w-md text-center text-lg text-muted-foreground">
          Страница не найдена.
        </p>
        <Button asChild variant="default" size="default" className="mt-2 min-h-11">
          <Link to="/">Вернуться на главную</Link>
        </Button>
      </main>
    </div>
  )
}

export default NotFound
