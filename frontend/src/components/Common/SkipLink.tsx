import { Link, LinkProps } from "@chakra-ui/react"

const skipLinkStyles: LinkProps = {
  position: "absolute",
  top: 2,
  left: 2,
  zIndex: 9999,
  p: 3,
  bg: "bg",
  color: "fg",
  borderRadius: "md",
  fontWeight: "bold",
  boxShadow: "md",
  outline: "2px solid transparent",
  outlineOffset: "2px",
  _focus: {
    outlineColor: "blue.500",
    transform: "translateY(0)",
  },
  transform: "translateY(-200%)",
  transition: "transform 0.2s",
}

export function SkipLink() {
  return (
    <Link href="#main-content" {...skipLinkStyles}>
      Перейти к основному содержимому
    </Link>
  )
}
