import {
  createFileRoute,
  isRedirect,
  redirect,
} from '@tanstack/react-router';
import { useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { IconType } from 'react-icons';
import {
  FiAlertCircle,
  FiAnchor,
  FiBarChart2,
  FiBox,
  FiClock,
  FiCpu,
  FiEdit2,
  FiList,
  FiMenu,
  FiMoreHorizontal,
  FiPlus,
  FiShare2,
  FiTool,
  FiTrash2,
} from 'react-icons/fi';
import { toast } from 'sonner';
import type { StickToBottomContext } from 'use-stick-to-bottom';
import { fetchAgentPermissions } from '@/api/agent.ts';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments.tsx';
import {
  Conversation,
  ConversationContent,
  ConversationDownload,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation.tsx';
import {
  Message,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message.tsx';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input.tsx';
import { ErrorFallback } from '@/components/Common/ErrorFallback.tsx';
import { Button } from '@/components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.tsx';
import { Input } from '@/components/ui/input.tsx';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet.tsx';
import {
  CHAT_COLUMN_MAX,
  SIDEBAR_W,
  SKLAD_LOGO_SRC,
  useAssistantSession,
} from '@/contexts/AssistantSessionContext.tsx';
import { sanitizeAssistantChatContent } from '@/lib/agentReplySanitize.ts';
import { AssistantRichText } from '@/components/Common/AssistantRichText.tsx';
import { getErrorHttpStatus } from '@/lib/apiClient.ts';
import { cn } from '@/lib/utils.ts';

/** Картинки (MIME + расширения) и текстовые файлы; при пустом MIME — по расширению. */
const ASSISTANT_PROMPT_ACCEPT = [
  'image/*',
  'text/*',
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/yaml',
  'application/x-ndjson',
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.xml',
  '.yaml',
  '.yml',
  '.log',
  '.html',
  '.htm',
  '.rst',
  '.ini',
  '.cfg',
  '.conf',
  '.tsv',
  '.css',
  '.scss',
  '.less',
  '.sh',
  '.bash',
  '.env',
  '.toml',
  '.properties',
  '.adoc',
  '.c',
  '.h',
  '.cpp',
  '.cs',
  '.java',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.php',
  '.sql',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.vue',
  '.svelte',
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.bmp',
  '.svg',
  '.ico',
  '.avif',
  '.tif',
  '.tiff',
  '.heic',
  '.heif',
].join(',');

const ASSISTANT_PROMPT_MAX_FILE_BYTES = 14 * 1024 * 1024;

const EMPTY_STATE_SUGGESTIONS: { text: string; icon: IconType }[] = [
  { text: 'Сколько товаров просрочено?', icon: FiAlertCircle },
  { text: 'Покажи загрузку склада', icon: FiBarChart2 },
  { text: 'Какая техника нуждается в ТО?', icon: FiTool },
  { text: 'Есть ли открытые задания?', icon: FiList },
  { text: 'Какие товары скоро истекут?', icon: FiClock },
  { text: 'Сводка по складу', icon: FiBox },
];

function AssistantPromptAttachmentsHeader() {
  const attachments = usePromptInputAttachments();
  if (attachments.files.length === 0) return null;
  return (
    <PromptInputHeader>
      <Attachments variant='inline'>
        {attachments.files.map((attachment) => (
          <Attachment
            data={attachment}
            key={attachment.id}
            onRemove={() =>
              attachments.remove(attachment.id)
            }
          >
            <AttachmentPreview />
            <AttachmentRemove />
          </Attachment>
        ))}
      </Attachments>
    </PromptInputHeader>
  );
}

function AssistantPromptFooter() {
  const {
    input,
    historyLocked,
    chatMutation,
    isEnsuringChat,
    deepStudy,
    setDeepStudy,
  } = useAssistantSession();
  const { files } = usePromptInputAttachments();
  const empty = !input.trim() && files.length === 0;
  return (
    <PromptInputFooter>
      <PromptInputTools>
        <PromptInputActionMenu>
          <PromptInputActionMenuTrigger />
          <PromptInputActionMenuContent>
            <PromptInputActionAddAttachments label='Добавить файлы…' />
          </PromptInputActionMenuContent>
        </PromptInputActionMenu>
        <PromptInputButton
          variant={!deepStudy ? 'default' : 'ghost'}
          disabled={historyLocked}
          onClick={() => setDeepStudy(false)}
          title='Обычный ответ без расширенной сводки'
        >
          Стандарт
        </PromptInputButton>
        <PromptInputButton
          variant={deepStudy ? 'default' : 'ghost'}
          disabled={historyLocked}
          onClick={() => setDeepStudy(true)}
          title='Публичная сводка reasoning («как сформирован ответ»)'
          className='gap-1.5'
        >
          <FiCpu size={14} />
          Глубокое изучение
        </PromptInputButton>
      </PromptInputTools>
      <PromptInputSubmit
        aria-label='Отправить'
        disabled={historyLocked || empty}
        loading={chatMutation.isPending || isEnsuringChat}
      />
    </PromptInputFooter>
  );
}

export const Route = createFileRoute('/_layout/assistant')({
  beforeLoad: async ({ context }) => {
    try {
      const perm = await context.queryClient.fetchQuery({
        queryKey: ['agent-permissions'],
        queryFn: fetchAgentPermissions,
      });
      if (!perm.can_use) throw redirect({ to: '/' });
    } catch (e) {
      if (isRedirect(e)) throw e;
      const st = getErrorHttpStatus(e);
      if (st === 401 || st === 403) {
        throw redirect({ to: '/login' });
      }
      throw e;
    }
  },
  component: AssistantPage,
});

function AssistantPage() {
  const {
    input,
    setInput,
    composerResetKey,
    messages,
    activeChatId,
    streamingMessageId,
    historyDrawerOpen,
    setHistoryDrawerOpen,
    chatSearchQuery,
    setChatSearchQuery,
    sidebarHoveredChatId,
    setSidebarHoveredChatId,
    chatMenuOpenId,
    setChatMenuOpenId,
    isEnsuringChat,
    scrollRef,
    composerRef,
    chatsQuery,
    sortedChats,
    filteredChats,
    groupedChats,
    deleteChatMutation,
    chatMutation,
    send,
    newChat,
    selectChat,
    historyLocked,
    bootLoading,
  } = useAssistantSession();

  const onConversationContext = useCallback(
    (ctx: StickToBottomContext | null) => {
      if (ctx?.scrollRef.current) {
        scrollRef.current = ctx.scrollRef
          .current as HTMLDivElement;
      } else {
        scrollRef.current = null;
      }
    },
    [scrollRef],
  );

  const historyList = (
    <div className='flex h-full min-h-0 flex-col gap-3'>
      <Button
        type='button'
        className='h-[38px] w-full gap-2 rounded-full font-medium shadow-sm'
        size='sm'
        variant='outlineSky'
        disabled={historyLocked}
        onClick={newChat}
      >
        <span className='flex size-[22px] shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary'>
          <FiPlus size={14} strokeWidth={2.5} />
        </span>
        Новый чат
      </Button>
      <Input
        className='h-9 rounded-lg border border-sidebar-border bg-background/80 text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
        placeholder='Поиск по названию…'
        value={chatSearchQuery}
        onChange={(e) => setChatSearchQuery(e.target.value)}
      />
      <div
        className='min-h-0 flex-1 overflow-y-auto [scrollbar-color:var(--sidebar-border)_transparent] [scrollbar-width:thin]'
        style={{ scrollbarGutter: 'stable' }}
      >
        {filteredChats.length === 0 &&
        sortedChats.length > 0 ? (
          <p className='px-1 py-2 text-xs text-muted-foreground'>
            Ничего не найдено
          </p>
        ) : null}
        {groupedChats.map((group, gi) => (
          <div key={`${group.label}-${gi}`}>
            <p
              className={cn(
                'select-none px-1.5 pb-1.5 text-xs font-semibold text-muted-foreground',
                gi === 0 ? 'pt-0' : 'pt-3',
              )}
            >
              {group.label}
            </p>
            {group.chats.map((c) => {
              const active = c.id === activeChatId;
              const showMenuBtn =
                active ||
                sidebarHoveredChatId === c.id ||
                chatMenuOpenId === c.id;
              return (
                <div
                  key={c.id}
                  className={cn(
                    // Как у поля «Поиск по названию»: h-9, полная ширина, рамка и скругление
                    'mb-0.5 flex h-9 w-full min-w-0 items-center gap-1 rounded-lg border border-sidebar-border px-3 shadow-sm transition-colors',
                    active
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                      : 'bg-background/80 hover:bg-sidebar-accent/80',
                  )}
                  onMouseEnter={() =>
                    setSidebarHoveredChatId(c.id)
                  }
                  onMouseLeave={() =>
                    setSidebarHoveredChatId(null)
                  }
                >
                  <Button
                    type='button'
                    variant='ghost'
                    className={cn(
                      'h-full min-h-0 min-w-0 flex-1 justify-start rounded-none px-0 py-0 text-sm font-normal text-sidebar-foreground hover:bg-transparent',
                    )}
                    disabled={historyLocked}
                    onClick={() => selectChat(c.id)}
                  >
                    <span
                      className='truncate text-left text-sm'
                      title={c.title}
                    >
                      {c.title}
                    </span>
                  </Button>
                  <DropdownMenu
                    onOpenChange={(open) =>
                      setChatMenuOpenId(open ? c.id : null)
                    }
                  >
                    <DropdownMenuTrigger asChild>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon-sm'
                        aria-label='Действия с чатом'
                        className={cn(
                          '-mr-1 shrink-0 rounded-md md:transition-opacity md:duration-150',
                          active
                            ? 'text-sidebar-accent-foreground/90 hover:bg-sidebar-accent/80 hover:text-sidebar-accent-foreground'
                            : 'text-muted-foreground hover:bg-sidebar-accent/80 hover:text-sidebar-foreground',
                          // md:opacity-0 раньше перекрывало opacity-100 — на десктопе «⋯» не показывались
                          showMenuBtn
                            ? 'opacity-100 md:opacity-100'
                            : 'opacity-100 md:opacity-0',
                        )}
                        disabled={historyLocked}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FiMoreHorizontal size={18} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className='min-w-44 shadow-lg'>
                      <DropdownMenuItem
                        className='gap-2 py-2 opacity-45'
                        disabled
                      >
                        <FiEdit2 size={16} />
                        Переименовать
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='gap-2 py-2 opacity-45'
                        disabled
                      >
                        <FiAnchor size={16} />
                        Закрепить
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className='gap-2 py-2 opacity-45'
                        disabled
                      >
                        <FiShare2 size={16} />
                        Поделиться
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant='outlineDestructive'
                        className='gap-2 py-2'
                        onSelect={() =>
                          deleteChatMutation.mutate(c.id)
                        }
                      >
                        <FiTrash2 size={16} />
                        Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );

  if (chatsQuery.isError) {
    return (
      <div className='w-full max-w-full px-2 py-4 md:px-4 md:py-6'>
        <p className='text-sm text-destructive'>
          Не удалось загрузить историю чатов. Обновите
          страницу.
        </p>
      </div>
    );
  }

  if (bootLoading) {
    return (
      <div className='w-full max-w-full px-2 py-4 md:px-4 md:py-6'>
        <div className='flex h-[calc(100dvh-10.5rem)] min-h-[200px] items-center justify-center md:h-[calc(100dvh-9rem)]'>
          <p className='text-sm text-muted-foreground'>
            Загрузка чатов…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className='w-full max-w-full px-0 py-0'>
      <div className='mx-auto flex h-[calc(100dvh-10.5rem)] min-h-[380px] max-h-[calc(100dvh-8rem)] w-full max-w-full items-stretch md:h-[calc(100dvh-9rem)] md:max-h-[calc(100dvh-7rem)]'>
        <div className='flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-background shadow-sm md:flex-row'>
          <div
            className='hidden flex-col border-r border-border/40 bg-sidebar p-3 text-sidebar-foreground md:flex dark:border-border/25'
            style={{
              width: SIDEBAR_W,
              flexShrink: 0,
              minWidth: 0,
              minHeight: 0,
            }}
          >
            <h2 className='text-sm font-semibold leading-tight tracking-tight text-sidebar-foreground'>
              Склад
            </h2>
            <p className='mb-3 text-[0.65rem] leading-tight text-muted-foreground'>
              Ассистент склада
            </p>
            {historyList}
          </div>

          <div className='flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background'>
            <div
              className={cn(
                'flex shrink-0 items-center gap-2 border-border bg-background/95 px-3 py-2.5 backdrop-blur-sm md:px-5',
                messages.length === 0 &&
                  !chatMutation.isPending &&
                  !streamingMessageId &&
                  !isEnsuringChat
                  ? 'border-b-0'
                  : 'border-b border-border',
              )}
            >
            <Button
              type='button'
              variant='ghost'
              size='icon-sm'
              aria-label='История чатов'
              className='shrink-0 rounded-lg md:hidden'
              onClick={() => setHistoryDrawerOpen(true)}
            >
              <FiMenu />
            </Button>
            <h2 className='min-w-0 flex-1 truncate text-sm font-semibold tracking-tight'>
              {messages.length > 0 ? 'Чат' : 'Новый диалог'}
            </h2>
            {messages.length > 0 ? (
              <ConversationDownload
                messages={messages.map((m) => ({
                  role: m.role,
                  content: m.content,
                }))}
                filename={`sklad-${activeChatId ?? 'chat'}.md`}
                className='static top-auto right-auto shrink-0 rounded-lg'
                aria-label='Скачать переписку'
              />
            ) : null}
          </div>

          <ErrorBoundary FallbackComponent={ErrorFallback}>
          <div className='relative flex min-h-0 flex-1 flex-col overflow-hidden'>
            <Conversation
              contextRef={onConversationContext}
              className='flex min-h-0 w-full flex-1 flex-col bg-background'
            >
              <ConversationContent
                className='min-h-0 flex-1 flex-col gap-0 p-0'
                style={{
                  scrollbarGutter: 'stable',
                  scrollBehavior: 'smooth',
                }}
              >
                {messages.length === 0 &&
                !chatMutation.isPending &&
                !streamingMessageId &&
                !isEnsuringChat ? (
                  <div className='flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 md:py-12'>
                    <div
                      className='w-full'
                      style={{ maxWidth: CHAT_COLUMN_MAX }}
                    >
                      <div className='mb-6 flex flex-wrap items-center justify-center gap-3 max-sm:gap-3 md:gap-4'>
                        <img
                          src={SKLAD_LOGO_SRC}
                          alt='Склад'
                          className='h-[34px] w-auto max-w-[120px] shrink-0 object-contain md:h-10'
                          draggable={false}
                        />
                        <h1 className='text-center text-2xl font-semibold tracking-tight text-foreground sm:text-left md:text-3xl'>
                          Чем могу помочь?
                        </h1>
                      </div>
                      <p className='mx-auto mb-5 max-w-[32rem] text-center text-sm leading-relaxed text-muted-foreground md:text-[0.9375rem]'>
                        {!activeChatId
                          ? sortedChats.length > 0
                            ? 'Предыдущий чат в списке слева; напишите ниже, чтобы продолжить.'
                            : 'Задайте вопрос по складу — диалог появится в истории после первой отправки.'
                          : 'Например: «Сколько позиций на складе?», «Какие ряды в layout?»'}
                      </p>
                      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                        {EMPTY_STATE_SUGGESTIONS.map((s) => (
                          <button
                            key={s.text}
                            type='button'
                            className='flex items-center gap-3 rounded-lg border border-border p-3 text-left text-sm transition-colors hover:bg-muted'
                            onClick={() =>
                              send({
                                text: s.text,
                                files: [],
                              })
                            }
                          >
                            <s.icon className='size-5 shrink-0 text-muted-foreground' />
                            <span>{s.text}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className='flex w-full flex-col'>
                    {messages.map((m) =>
                      m.role === 'user' ? (
                        <Message
                          key={m.id}
                          from='user'
                          className='w-full px-4 py-4 md:px-8 md:py-5'
                        >
                          <div
                            className='mx-auto flex w-full justify-end'
                            style={{
                              maxWidth: CHAT_COLUMN_MAX,
                            }}
                          >
                            <MessageContent className='max-w-[min(85%,36rem)] rounded-2xl border border-border bg-muted px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground shadow-sm transition-[box-shadow,border-color] duration-200'>
                              {m.content}
                            </MessageContent>
                          </div>
                        </Message>
                      ) : (
                        <Message
                          key={m.id}
                          from='assistant'
                          className='w-full px-4 py-4 md:px-8 md:py-5'
                        >
                          <div
                            className='mx-auto flex w-full items-start gap-3'
                            style={{
                              maxWidth: CHAT_COLUMN_MAX,
                            }}
                          >
                            <div className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-[10px] font-bold text-muted-foreground motion-safe:animate-in motion-safe:fade-in'>
                              AI
                            </div>
                            <MessageContent className='min-w-0 flex-1'>
                              <div className='mb-2 flex flex-wrap items-center gap-2 gap-y-1'>
                                <span className='text-xs font-semibold text-muted-foreground'>
                                  Ассистент
                                </span>
                                <span
                                  className={cn(
                                    'rounded-md border px-2 py-0.5 text-xs',
                                    m.llmAvailable
                                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300'
                                      : 'border-border bg-muted text-muted-foreground',
                                  )}
                                >
                                  {m.llmAvailable
                                    ? `LLM${m.model ? `: ${m.model}` : ''}`
                                    : 'без LLM'}
                                </span>
                              </div>
                              {streamingMessageId ===
                              m.id ? (
                                <p className='mb-2 text-xs tracking-wide text-muted-foreground motion-safe:animate-pulse'>
                                  Изучаем информацию
                                </p>
                              ) : null}
                              <MessageResponse>
                                <AssistantRichText
                                  text={sanitizeAssistantChatContent(
                                    m.content,
                                  )}
                                >
                                {streamingMessageId ===
                                m.id ? (
                                  <span className='ml-0.5 inline-block align-text-bottom text-muted-foreground motion-safe:animate-pulse'>
                                    ▍
                                  </span>
                                ) : null}
                                </AssistantRichText>
                              </MessageResponse>
                              {m.publicReasoning &&
                              streamingMessageId !==
                                m.id ? (
                                <details className='mt-3 text-xs text-muted-foreground [&_summary::-webkit-details-marker]:hidden [&_summary]:cursor-pointer [&_summary]:list-none'>
                                  <summary className='select-none font-semibold text-foreground'>
                                    Как сформирован ответ
                                  </summary>
                                  <div className='mt-2 border-l-[3px] border-border pl-2'>
                                    <p className='mb-1'>
                                      <span className='font-medium'>
                                        Кратко:{' '}
                                      </span>
                                      {
                                        m.publicReasoning
                                          .brief_explanation
                                      }
                                    </p>
                                    {(m.publicReasoning
                                      .tools_used?.length ?? 0) >
                                    0 ? (
                                      <p className='mb-1'>
                                        Инструменты:{' '}
                                        {(m.publicReasoning.tools_used ?? [])
                                          .map(
                                            (t) =>
                                              t.name || '?',
                                          )
                                          .join(', ')}
                                      </p>
                                    ) : null}
                                    <p className='mb-1'>
                                      Источники данных:{' '}
                                      {(m.publicReasoning.data_sources ?? []).join(
                                        ', ',
                                      )}
                                    </p>
                                    <p>
                                      <span className='font-medium'>
                                        Итог:{' '}
                                      </span>
                                      {
                                        m.publicReasoning
                                          .recommendation
                                      }
                                    </p>
                                    {m.publicReasoning
                                      .next_steps &&
                                    m.publicReasoning
                                      .next_steps !==
                                      '—' ? (
                                      <p className='mt-1'>
                                        <span className='font-medium'>
                                          Следующие
                                          шаги:{' '}
                                        </span>
                                        {
                                          m.publicReasoning
                                            .next_steps
                                        }
                                      </p>
                                    ) : null}
                                    {m.publicReasoning
                                      .confidence ? (
                                      <p className='mt-1'>
                                        <span className='font-medium'>
                                          Уверенность:{' '}
                                        </span>
                                        {
                                          m.publicReasoning
                                            .confidence
                                        }
                                      </p>
                                    ) : null}
                                    {m.publicReasoning
                                      .kpi_effect ? (
                                      <p className='mt-1'>
                                        <span className='font-medium'>
                                          Эффект / KPI:{' '}
                                        </span>
                                        {
                                          m.publicReasoning
                                            .kpi_effect
                                        }
                                      </p>
                                    ) : null}
                                    {m.publicReasoning
                                      .operational_cycle &&
                                    Object.keys(
                                      m.publicReasoning
                                        .operational_cycle,
                                    ).length > 0 ? (
                                      <div className='mt-2 text-[10px] opacity-85'>
                                        <p className='mb-0.5 font-medium'>
                                          Цикл агента
                                        </p>
                                        {Object.entries(
                                          m.publicReasoning
                                            .operational_cycle,
                                        ).map(([k, v]) => (
                                          <p key={k}>
                                            {k}: {v}
                                          </p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </details>
                              ) : null}
                            </MessageContent>
                          </div>
                        </Message>
                      ),
                    )}
                    {chatMutation.isPending ? (
                      <div className='w-full bg-transparent px-4 py-4 motion-safe:animate-in md:px-8 md:py-5'>
                        <div
                          className='mx-auto flex w-full items-center gap-3'
                          style={{
                            maxWidth: CHAT_COLUMN_MAX,
                          }}
                        >
                          <div className='flex size-7 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-[10px] font-bold text-muted-foreground'>
                            AI
                          </div>
                          <p className='text-sm tracking-wide text-muted-foreground motion-safe:animate-pulse'>
                            Изучаем информацию
                          </p>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>

            <div className='shrink-0 bg-background'>
              <div className='w-full px-3 pb-4 md:px-5'>
                <div
                  className='mx-auto w-full'
                  style={{ maxWidth: CHAT_COLUMN_MAX }}
                >
                  <PromptInput
                    key={composerResetKey}
                    globalDrop
                    multiple
                    accept={ASSISTANT_PROMPT_ACCEPT}
                    maxFileSize={ASSISTANT_PROMPT_MAX_FILE_BYTES}
                    onAttachmentError={(err) => {
                      toast.error(
                        err.code === 'accept'
                          ? 'Можно прикреплять только изображения и текстовые файлы.'
                          : err.message,
                      );
                    }}
                    onSubmit={(msg) => {
                      void send({
                        text: msg.text ?? '',
                        files: msg.files ?? [],
                      });
                    }}
                  >
                    <AssistantPromptAttachmentsHeader />
                    <PromptInputBody>
                      <PromptInputTextarea
                        ref={composerRef}
                        value={input}
                        onChange={(e) =>
                          setInput(e.target.value)
                        }
                        placeholder={
                          messages.length === 0
                            ? 'Спросите у ассистента склада'
                            : 'Сообщение для ассистента склада…'
                        }
                        rows={2}
                        onKeyDown={(e) => {
                          if (
                            e.key === 'Enter' &&
                            !e.shiftKey
                          ) {
                            e.preventDefault();
                            e.currentTarget.form?.requestSubmit();
                          }
                        }}
                      />
                    </PromptInputBody>
                    <AssistantPromptFooter />
                  </PromptInput>
                  <p className='mt-2 text-[0.65rem] leading-snug text-muted-foreground'>
                    Картинки и текстовые файлы, до 14 МБ
                    каждый. Enter — отправить · Shift+Enter —
                    новая строка · перетащите файлы в область
                    ввода
                  </p>
                </div>
              </div>
            </div>
          </div>
          </ErrorBoundary>
        </div>
      </div>
    </div>
    <Sheet
      open={historyDrawerOpen}
      onOpenChange={setHistoryDrawerOpen}
    >
      <SheetContent
        side='left'
        className='flex h-full max-h-full w-full flex-col gap-0 border border-sidebar-border bg-sidebar p-0 text-sidebar-foreground sm:max-w-[272px]'
      >
        <SheetHeader className='border-b-0 pb-0 pr-10 text-left'>
          <SheetTitle className='font-semibold tracking-tight text-sidebar-foreground'>
            Склад
          </SheetTitle>
          <p className='mt-0.5 text-[0.65rem] font-normal text-muted-foreground'>
            История чатов
          </p>
        </SheetHeader>
        <div className='min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-6'>
          {historyList}
        </div>
      </SheetContent>
    </Sheet>
    </div>
  );
}
