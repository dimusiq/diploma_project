import { Container, Heading, Stack } from "@chakra-ui/react"
import { useTheme } from "next-themes"

import { Radio, RadioGroup } from "@/components/ui/radio.tsx"

const Appearance = () => {
  const { theme, setTheme } = useTheme()

  return (
    <Container maxW="full">
      <Heading size="sm" py={4}>
        Выбор темы
      </Heading>

      <RadioGroup
        onValueChange={(e) => {
          if (e.value != null) setTheme(e.value)
        }}
        value={theme}
        colorPalette="cyan"
      >
        <Stack>
          <Radio value="system">Системная</Radio>
          <Radio value="light">Светлая тема</Radio>
          <Radio value="dark">Темная тема</Radio>
        </Stack>
      </RadioGroup>
    </Container>
  )
}
export default Appearance
