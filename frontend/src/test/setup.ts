import "@testing-library/jest-dom/vitest"
import * as matchers from "@testing-library/jest-dom/matchers"
import { expect } from "vitest"

// Vitest 3 loads a separate expect instance from the jest-dom side effect.
expect.extend(matchers)
