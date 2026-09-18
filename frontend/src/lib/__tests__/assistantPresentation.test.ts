import { describe, expect, it } from "vitest"
import { parseAssistantMarkdown, parseInline } from "@/lib/assistantMarkdown.ts"
import {
  formatPublicReasoningForUser,
  humanizeDataSource,
  isAssistantFailureReply,
} from "@/lib/assistantPresentation.ts"
import { sanitizeAssistantChatContent } from "@/lib/agentReplySanitize.ts"

describe("assistantPresentation", () => {
  it("detects failed LLM replies", () => {
    expect(
      isAssistantFailureReply(
        "Не удалось стабильно сгенерировать текст ответа LLM, но данные по инструментам получены. Повторите запрос.",
      ),
    ).toBe(true)
    expect(isAssistantFailureReply("На складе 12 позиций.")).toBe(false)
  })

  it("humanizes internal data sources", () => {
    expect(
      humanizeDataSource("agent_knowledge_rag(keyword, n=3)"),
    ).toBe("База знаний")
    expect(humanizeDataSource("operational_state_warehouse_context")).toBe(
      "Состояние склада",
    )
  })

  it("hides duplicate brief, internals and confidence on failed replies", () => {
    const view = formatPublicReasoningForUser(
      {
        brief_explanation:
          "<answer>Не удалось стабильно сгенерировать текст</answer>",
        tools_used: [],
        data_sources: [
          "operational_state_warehouse_context",
          "agent_knowledge_rag(keyword, n=3)",
          "some_internal_metric",
        ],
        recommendation: "См. ответ ассистента выше.",
        models: {},
        main_loop_task: "chat",
        next_steps: "—",
        confidence: "средняя",
        operational_cycle: { act: "без вызовов" },
      },
      "Не удалось стабильно сгенерировать текст",
    )
    expect(view).not.toBeNull()
    expect(view?.brief).toBeNull()
    expect(view?.recommendation).toBeNull()
    expect(view?.nextSteps).toBeNull()
    expect(view?.sources).toEqual(["Состояние склада", "База знаний"])
    expect(view?.confidence).toBeNull()
  })

  it("drops unknown internal source keys", () => {
    expect(humanizeDataSource("some_internal_metric")).toBeNull()
    expect(humanizeDataSource("Состояние склада")).toBe("Состояние склада")
  })
})

describe("sanitizeAssistantChatContent", () => {
  it("strips leftover answer tags", () => {
    expect(
      sanitizeAssistantChatContent(
        "<answer>Краткий ответ</answer>",
      ),
    ).toBe("Краткий ответ")
  })
})

describe("assistantMarkdown", () => {
  it("parses lists, bold, slots and links", () => {
    const blocks = parseAssistantMarkdown(
      "## Итог\n- Ячейка **0-0-0-1**\n- [Дашборд](https://example.com)\n\nВсего `12`.",
    )
    expect(blocks[0]).toMatchObject({ type: "h", level: 2 })
    expect(blocks[1]?.type).toBe("ul")
    expect(parseInline("код `x` и 0-0-0-1")).toEqual([
      { type: "text", value: "код " },
      { type: "code", value: "x" },
      { type: "text", value: " и " },
      { type: "slot", key: "0-0-0-1" },
    ])
  })
})
