import { describe, expect, it } from "vitest"
import {
  isTechniqueSidebarItemActive,
  techniqueProcessHeading,
  techniqueSectionTabs,
} from "../techniqueNav.ts"

describe("techniqueNav", () => {
  it("не показывает вкладку списка техники в ТО", () => {
    const tabs = techniqueSectionTabs("/technique/maintenance")
    expect(tabs.map((tab) => tab.path)).toEqual([
      "/technique/maintenance",
      "/technique/maintenance-schedule",
      "/technique/maintenance-settings",
      "/technique/alerts",
      "/technique/spare-parts",
    ])
    expect(tabs.some((tab) => tab.path === "/technique")).toBe(false)
  })

  it("группирует наряды и аналитику отдельно", () => {
    expect(techniqueProcessHeading("/technique/work-orders")).toBe("Наряды")
    expect(techniqueSectionTabs("/technique/technicians").map((tab) => tab.id)).toEqual([
      "work-orders",
      "technicians",
    ])
    expect(techniqueProcessHeading("/technique/predictive")).toBe("Аналитика")
  })

  it("подсвечивает ТО для календаря и мониторинга", () => {
    expect(
      isTechniqueSidebarItemActive(
        "/technique/maintenance",
        "/technique/maintenance-schedule",
      ),
    ).toBe(true)
    expect(
      isTechniqueSidebarItemActive("/technique/maintenance", "/technique/alerts"),
    ).toBe(true)
    expect(
      isTechniqueSidebarItemActive(
        "/technique/maintenance",
        "/technique/equipment/abc",
      ),
    ).toBe(true)
    expect(
      isTechniqueSidebarItemActive("/technique/work-orders", "/technique/analytics"),
    ).toBe(false)
  })

  it("подсвечивает Оборудование и не путает его с ТО", () => {
    expect(isTechniqueSidebarItemActive("/equipment", "/equipment/id-agv-1")).toBe(
      true,
    )
    expect(
      isTechniqueSidebarItemActive("/equipment", "/technique/maintenance"),
    ).toBe(false)
    expect(
      isTechniqueSidebarItemActive("/technique/maintenance", "/equipment"),
    ).toBe(false)
  })
})
