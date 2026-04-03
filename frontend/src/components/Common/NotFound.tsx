import { Link } from "@tanstack/react-router"

import { Button } from "@/components/ui/button.tsx"

const NotFound = () => {
  return (
    <div
      className="flex h-screen flex-col items-center justify-center p-4"
      data-testid="not-found"
    >
      <div className="z-[1] flex items-center">
        <div className="ml-4 flex flex-col items-center justify-center p-4">
          <p className="mb-4 text-6xl leading-none font-bold md:text-8xl">404</p>
          <p className="mb-2 text-2xl font-bold">Ошибка!</p>
        </div>
      </div>

      <p className="z-[1] mb-4 text-center text-lg text-muted-foreground">
        Страница не найдена.
      </p>
      <div className="z-[1] flex justify-center">
        <Link to="/">
          <Button variant="default" size="sm" className="mt-4 self-center">
            Вернуться на главную
          </Button>
        </Link>
      </div>
    </div>
  )
}

export default NotFound
