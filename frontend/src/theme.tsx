import { createSystem, defaultConfig } from "@chakra-ui/react"
import { buttonRecipe } from "./theme/button.recipe.ts"

export const system = createSystem(defaultConfig, {
  globalCss: {
    html: {
      fontSize: "16px",
    },
    body: {
      fontSize: "0.875rem",
      margin: 0,
      padding: 0,
    },
    ".main-link": {
      color: "ui.main",
      fontWeight: "bold",
    },
    "*:focus-visible": {
      outline: "2px solid",
      outlineColor: "blue.500",
      outlineOffset: "2px",
    },
  },
  theme: {
    tokens: {
      colors: {
        ui: {
          main: { value: "#1f80aa" },
        },
        semantic: {
          success: { value: "#22c55e" },
          warning: { value: "#f97316" },
          error: { value: "#ef4444" },
          info: { value: "#3b82f6" },
        },
      },
    },
    recipes: {
      button: buttonRecipe,
    },
  },
})
