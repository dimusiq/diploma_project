import { defineRecipe } from "@chakra-ui/react"

export const buttonRecipe = defineRecipe({
  base: {
    fontWeight: "semibold",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    colorPalette: "blue",
  },
  variants: {
    variant: {
      solid: {},
      outline: {},
      ghost: {
        bg: "transparent",
        _hover: {
          bg: "gray.100",
        },
        _dark: {
          _hover: {
            bg: "gray.800",
          },
        },
      },
      subtle: {},
    },
  },
  defaultVariants: {
    variant: "solid",
  },
})
