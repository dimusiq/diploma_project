import { defineConfig } from "@hey-api/openapi-ts"

export default defineConfig({
  client: "legacy/axios",
  input: "./openapi.json",
  output: "./src/client",
  // exportSchemas: true,
  plugins: [
    {
      name: "@hey-api/sdk",
      // NOTE: this doesn't allow tree-shaking
      asClass: true,
      operationId: true,
      methodNameBuilder: (operation) => {
        // @ts-expect-error — поля зависят от версии генератора
        let name: string = operation.name ?? operation.id ?? "call"
        // @ts-expect-error
        const service: string = operation.service ?? ""

        if (service && name.toLowerCase().startsWith(service.toLowerCase())) {
          name = name.slice(service.length)
        }
        if (!name) name = "call"

        return name.charAt(0).toLowerCase() + name.slice(1)
      },
    },
  ],
})
