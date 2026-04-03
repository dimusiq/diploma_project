export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="fixed top-2 left-2 z-[9999] -translate-y-[200%] rounded-md bg-background p-3 font-bold text-foreground shadow-md transition-transform focus:translate-y-0 focus:outline-2 focus:outline-offset-2 focus:outline-ring"
    >
      Перейти к основному содержимому
    </a>
  )
}
