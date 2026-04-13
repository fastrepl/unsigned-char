import {
  Outlet,
  RouterProvider,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ChevronDown, ChevronLeft, Ellipsis, Users } from "lucide-react";
import {
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import brandWordmark from "./assets/brand-wordmark.svg";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "./components/number-field";
import {
  Badge,
  Button,
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardPanel,
  CardTitle,
  Input,
  Kbd,
  ScrollFade,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
  cn,
} from "./components/ui";
import { useScrollFade } from "./hooks/useScrollFade";
import {
  LANGUAGE_OPTIONS,
  PROCESSING_MODE_OPTIONS,
  appStore,
  currentSetupBannerContent,
  formatClockSeconds,
  formatDateTime,
  getMeetingTranscriptEntries,
  getTimezoneOptions,
  isSettingsWindow,
  requiresAppSetup,
  sortedMeetings,
  type ManagedModelDownloadState,
  type Meeting,
  type TranscriptEntry,
  useAppState,
} from "./store";
import {
  type MenuItemDef,
  showNativeContextMenu,
  showNativeMenu,
} from "./hooks/useNativeContextMenu";
import {
  SUMMARY_PROVIDERS,
  getSummaryProviderDefinition,
} from "./lib/summary-providers";

function IconChevronDown() {
  return <ChevronDown className="size-4 opacity-60" strokeWidth={1.5} aria-hidden="true" />;
}

function IconBack() {
  return <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden="true" />;
}

function IconMore() {
  return <Ellipsis className="size-4" strokeWidth={1.5} aria-hidden="true" />;
}

function IconClose() {
  return (
    <svg className="size-3" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d="M3 3 9 9M9 3 3 9"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BrandWordmark({ className }: { className?: string }) {
  return <img src={brandWordmark} alt="unsigned {char}" className={cn("block h-9 w-auto", className)} />;
}

const AI_SUMMARIES_SETTINGS_SECTION = "ai-summaries";
const AI_SUMMARIES_SETTINGS_SECTION_ID = "settings-ai-summaries";

function readTargetSettingsSection() {
  const queryIndex = window.location.hash.indexOf("?");

  if (queryIndex < 0) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
  const section = params.get("section");

  return section === AI_SUMMARIES_SETTINGS_SECTION ? AI_SUMMARIES_SETTINGS_SECTION : null;
}

function scrollSettingsSectionIntoView(section: string | null) {
  if (section !== AI_SUMMARIES_SETTINGS_SECTION) {
    return;
  }

  document
    .getElementById(AI_SUMMARIES_SETTINGS_SECTION_ID)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LiveIndicator({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("relative inline-flex size-3 shrink-0 items-center justify-center", className)}
    >
      <span className="absolute inline-flex size-3 animate-ping rounded-full bg-rose-400/35 motion-reduce:animate-none" />
      <span className="relative inline-flex size-2 rounded-full bg-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]" />
    </span>
  );
}

function formatTranscriptSpeakerLabel(speaker: string) {
  const normalized = speaker.trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");

  if (!normalized) {
    return "Speaker";
  }

  const speakerNumberMatch = normalized.match(/^speaker\s*0*([0-9]+)$/i);
  if (speakerNumberMatch) {
    return `Speaker ${Number.parseInt(speakerNumberMatch[1], 10) + 1}`;
  }

  if (/^mic(rophone)?$/i.test(normalized)) {
    return "Mic";
  }

  return normalized;
}

function formatTranscriptSourceLabel(source: TranscriptEntry["source"]) {
  if (source === "microphone") {
    return "Mic";
  }

  if (source === "system") {
    return "System";
  }

  return "Mixed";
}

function getTranscriptEntryMeta(meeting: Meeting, entry: TranscriptEntry, index: number) {
  const segment = meeting.diarizationSegments[index];

  if (segment) {
    return {
      speakerLabel: formatTranscriptSpeakerLabel(segment.speaker),
      timestampLabel: formatClockSeconds(segment.startSeconds),
    };
  }

  return {
    speakerLabel: formatTranscriptSourceLabel(entry.source),
    timestampLabel: index === 0 ? formatClockSeconds(0) : null,
  };
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "ready" | "missing" | "off" | "live" | "done";
  children: ReactNode;
}) {
  const variants = {
    ready: "success",
    missing: "warning",
    off: "secondary",
    live: "destructive",
    done: "outline",
  } as const;

  return (
    <Badge variant={variants[tone]}>
      {children}
    </Badge>
  );
}

function getModelDownloadProgressPercent(download: ManagedModelDownloadState | null) {
  if (!download?.totalBytes || download.totalBytes <= 0) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round((download.bytesDownloaded / download.totalBytes) * 100)));
}

function ModelDownloadGauge({
  busy,
  download,
}: {
  busy: boolean;
  download: ManagedModelDownloadState | null;
}) {
  const progressPercent = getModelDownloadProgressPercent(download);
  const progressLabel = progressPercent === null ? "0%" : `${progressPercent}%`;
  const progressWidth = progressPercent === null ? "2%" : `${Math.max(progressPercent, 2)}%`;

  return (
    <div className="w-full rounded-[calc(var(--radius)-6px)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-zinc-900">
          {download?.currentFile ?? (busy ? "Starting download..." : "Preparing download...")}
        </p>
        <span className="shrink-0 text-sm text-zinc-500">{progressLabel}</span>
      </div>
      <div
        aria-label="Model download progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={progressPercent ?? 0}
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200"
        role="progressbar"
      >
        <div
          className={cn(
            "h-full rounded-full bg-zinc-950 transition-[width] duration-500 ease-out",
            progressPercent === null && "animate-pulse",
          )}
          style={{ width: progressWidth }}
        />
      </div>
    </div>
  );
}

function isMeetingDeleteDisabled(
  meeting: Meeting,
  transcriptionBusy: boolean,
  transcriptionRunning: boolean,
  recordingMeetingId: string | null,
) {
  return (
    transcriptionBusy ||
    recordingMeetingId === meeting.id ||
    (meeting.status === "live" && transcriptionRunning)
  );
}

type DeleteMeetingRequest = Pick<Meeting, "id" | "title">;

function getMeetingActionMenuItems(
  meeting: Meeting,
  deleteDisabled: boolean,
  onDeleteRequested: (meeting: DeleteMeetingRequest) => void,
): MenuItemDef[] {
  return [
    {
      id: `show-meeting-in-finder-${meeting.id}`,
      text: "Show in Finder",
      action: () => {
        void appStore.revealMeetingExportInFinder(meeting.id);
      },
    },
    { separator: true },
    {
      id: `delete-meeting-${meeting.id}`,
      text: "Delete meeting",
      disabled: deleteDisabled,
      action: () => {
        onDeleteRequested({ id: meeting.id, title: meeting.title });
      },
    },
  ];
}

function DeleteMeetingDialog({
  meeting,
  onCancel,
  onConfirm,
}: {
  meeting: DeleteMeetingRequest | null;
  onCancel: () => void;
  onConfirm: (meetingId: string) => void;
}) {
  if (!meeting) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/20 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onCancel}
      role="presentation"
    >
      <Card
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-meeting-title"
        aria-describedby="delete-meeting-description"
        className="w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(meeting.id);
          }}
        >
          <CardHeader>
            <CardTitle id="delete-meeting-title">Delete meeting?</CardTitle>
            <CardDescription id="delete-meeting-description">
              Delete &quot;{meeting.title}&quot; from unsigned {"{char}"}? This also removes its
              saved markdown export.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-between gap-3">
            <p className="text-sm text-zinc-500">
              Press <Kbd className="mx-1 align-middle">Enter</Kbd> to confirm
            </p>
            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
              <Button variant="destructive" type="submit" autoFocus>
                Delete
              </Button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

const insetPanelClass =
  "rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-4 py-3";
const windowShellHeightClass = "h-[calc(100vh-2.5rem)]";
const appWindow = getCurrentWindow();

type SearchableOption = {
  value: string;
  label: string;
  detail?: string;
};

const summaryProviderOptions: readonly SearchableOption[] = [
  { value: "", label: "Disabled", detail: "Off" },
  ...SUMMARY_PROVIDERS.map((provider) => ({
    value: provider.id,
    label: provider.label,
    detail: provider.detail,
  })),
];

function shouldSkipWindowDrag(target: EventTarget | null) {
  return target instanceof Element && target.closest('[data-window-drag="false"]') !== null;
}

function WindowDragRegion({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  const handleMouseDown = (event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || shouldSkipWindowDrag(event.target)) {
      return;
    }

    void appWindow.startDragging();
  };

  return (
    <div className={className} onMouseDown={handleMouseDown}>
      {children}
    </div>
  );
}

function SearchableSelect({
  ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled = false,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableOption[];
  placeholder: string;
  searchPlaceholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedOption = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return options;
    }

    return options.filter((option) => {
      const haystack = `${option.label} ${option.detail ?? ""} ${option.value}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const option = filteredOptions[activeIndex];
      if (!option) {
        return;
      }

      onChange(option.value);
      close();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  };

  return (
    <div
      className={cn("relative", className)}
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        close();
      }}
    >
      <Button
        type="button"
        role="combobox"
        variant="outline"
        size="lg"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className="min-h-11 w-full justify-between px-4 text-left font-normal"
        onClick={() => {
          if (disabled) {
            return;
          }

          setOpen((current) => !current);
          setQuery("");
          setActiveIndex(0);
        }}
      >
        <span className={cn("truncate", !selectedOption && "text-zinc-500")}>
          {selectedOption
            ? selectedOption.detail
              ? `${selectedOption.label} (${selectedOption.detail})`
              : selectedOption.label
            : placeholder}
        </span>
        <IconChevronDown />
      </Button>

      {open ? (
        <Card className="absolute inset-x-0 top-[calc(100%+8px)] z-20 p-2">
          <Input
            autoFocus
            uiSize="sm"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="mb-2"
          />
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <Button
                  key={option.value}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-auto w-full justify-between rounded-[var(--radius-control-sm)] border-transparent px-3 py-2 text-left font-normal text-zinc-900 shadow-none",
                    index === activeIndex
                      ? "bg-zinc-100 hover:bg-zinc-100 data-pressed:bg-zinc-100"
                      : "hover:bg-zinc-50 data-pressed:bg-zinc-50",
                  )}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value);
                    close();
                  }}
                >
                  <span className="truncate">{option.label}</span>
                  {option.detail ? (
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                      {option.detail}
                    </span>
                  ) : null}
                </Button>
              ))
            ) : (
              <div className="px-3 py-2 text-sm text-zinc-500">No results found.</div>
            )}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function SpokenLanguagesCombobox({
  mainLanguage,
  value,
  disabled,
  onAdd,
  onRemove,
}: {
  mainLanguage: string;
  value: string[];
  disabled: boolean;
  onAdd: (value: string) => void;
  onRemove: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const filteredOptions = useMemo(
    () =>
      LANGUAGE_OPTIONS.filter(
        (option) =>
          option.value !== mainLanguage &&
          !value.includes(option.value) &&
          (!query.trim() ||
            `${option.label} ${option.value}`.toLowerCase().includes(query.trim().toLowerCase())),
      ),
    [mainLanguage, query, value],
  );

  const close = () => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  };

  const addOption = (nextValue: string) => {
    onAdd(nextValue);
    close();
  };

  const placeholder =
    filteredOptions.length === 0 && value.length > 0
      ? ""
      : filteredOptions.length === 0
        ? "All languages added"
        : value.length === 0
          ? "Add language"
          : "";

  return (
    <div
      className="relative"
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        close();
      }}
    >
      <div
        className={cn(
          "flex min-h-12 flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--card)] px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.85)]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {value.map((language) => (
          <Badge
            key={language}
            variant="secondary"
            className="gap-2 px-3 py-1 text-xs font-medium normal-case tracking-normal"
          >
            {LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ?? language}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="size-5 rounded-[var(--radius-control-sm)] border-transparent bg-transparent p-0 text-zinc-500 shadow-none hover:bg-transparent hover:text-zinc-900 data-pressed:bg-transparent"
              onClick={() => onRemove(language)}
              disabled={disabled}
            >
              <IconClose />
            </Button>
          </Badge>
        ))}
        <input
          value={query}
          disabled={disabled || filteredOptions.length === 0}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !query && value.length > 0) {
              event.preventDefault();
              onRemove(value[value.length - 1]!);
              return;
            }

            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setActiveIndex((index) => Math.min(index + 1, filteredOptions.length - 1));
              return;
            }

            if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => Math.max(index - 1, 0));
              return;
            }

            if (event.key === "Enter") {
              const option = filteredOptions[activeIndex];
              if (!option) {
                return;
              }

              event.preventDefault();
              addOption(option.value);
              return;
            }

            if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
          placeholder={placeholder}
          className="min-w-32 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
        />
      </div>

      {open && filteredOptions.length > 0 ? (
        <Card className="absolute inset-x-0 top-[calc(100%+8px)] z-20 p-2">
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.map((option, index) => (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                className={cn(
                  "h-auto w-full justify-between rounded-[var(--radius-control-sm)] border-transparent px-3 py-2 text-left font-normal text-zinc-900 shadow-none",
                  index === activeIndex
                    ? "bg-zinc-100 hover:bg-zinc-100 data-pressed:bg-zinc-100"
                    : "hover:bg-zinc-50 data-pressed:bg-zinc-50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addOption(option.value)}
              >
                <span>{option.label}</span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                  {option.value}
                </span>
              </Button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RootLayout() {
  return (
    <div
      className={cn(
        "relative isolate min-h-screen w-full text-zinc-900",
        isSettingsWindow && "bg-[linear-gradient(180deg,#fcfcfa_0%,var(--background)_48%,#f2f4f8_100%)]",
      )}
    >
      {isSettingsWindow ? (
        <WindowDragRegion className="absolute inset-x-0 top-0 z-20 h-10 w-full" />
      ) : (
        <WindowDragRegion className="h-10 w-full" />
      )}
      <div className="px-4">
        <Outlet />
      </div>
    </div>
  );
}

function HomeScreen() {
  const snapshot = useAppState();
  const navigate = useNavigate();
  const [meetingPendingDelete, setMeetingPendingDelete] = useState<DeleteMeetingRequest | null>(null);
  const meetings = sortedMeetings(snapshot.meetings);
  const setupBanner = currentSetupBannerContent(snapshot);
  const showModelDownloadGauge =
    snapshot.modelBusy || snapshot.modelDownload?.status === "downloading";
  const homeScrollFade = useScrollFade<HTMLDivElement>();
  const { attachRef: attachHomeScrollFade, handleScroll: handleHomeScroll } = homeScrollFade;
  const attachHomeContentRef = useCallback(
    (node: HTMLDivElement | null) => {
      attachHomeScrollFade(node);

      if (node) {
        node.scrollTop = snapshot.homeScrollTop;
      }
    },
    [attachHomeScrollFade],
  );

  return (
    <section className={cn("mx-auto flex max-w-[780px] flex-col gap-4", windowShellHeightClass)}>
      <WindowDragRegion className="flex items-center justify-between gap-4">
        <BrandWordmark className="relative -top-1 shrink-0" />
        <div data-window-drag="false">
          <Button
            size="lg"
            className="gap-2.5"
            disabled={snapshot.startMeetingBusy || requiresAppSetup(snapshot)}
            onClick={async () => {
              const meeting = await appStore.startMeeting();
              if (meeting) {
                navigate({
                  to: "/meeting/$meetingId",
                  params: { meetingId: meeting.id },
                });
              }
            }}
          >
            <span className="inline-flex items-center gap-2">
              <LiveIndicator />
              <span className="text-white">{snapshot.startMeetingBusy ? "Starting..." : "New meeting"}</span>
            </span>
          </Button>
        </div>
      </WindowDragRegion>

      <div className="relative -mx-4 min-h-0 flex-1">
        <div
          id="home-content"
          className="h-full overflow-y-auto"
          ref={attachHomeContentRef}
          onScroll={(event) => {
            handleHomeScroll(event);
            appStore.setHomeScrollTop(event.currentTarget.scrollTop);
          }}
        >
          <div className="px-4 pt-4 pb-4">
            {snapshot.permissionNote ? (
              <p className="mb-3 text-sm text-rose-700">{snapshot.permissionNote}</p>
            ) : null}

            {setupBanner ? (
              <Card className="mb-4">
                <CardHeader className="gap-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {setupBanner.kicker}
                  </p>
                  <CardTitle className="text-2xl">{setupBanner.title}</CardTitle>
                  <CardDescription>{setupBanner.copy}</CardDescription>
                </CardHeader>
                <CardPanel className="pt-4">
                  <p className="text-sm text-zinc-500">{setupBanner.detail}</p>
                  {setupBanner.localPath ? (
                    <div className={cn("mt-4", insetPanelClass)}>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Storage
                      </p>
                      <code className="mt-1 block break-all text-xs text-zinc-700">
                        {setupBanner.localPath}
                      </code>
                    </div>
                  ) : null}
                </CardPanel>
                {showModelDownloadGauge ? (
                  <CardFooter className="border-t-0 pt-0">
                    <ModelDownloadGauge busy={snapshot.modelBusy} download={snapshot.modelDownload} />
                  </CardFooter>
                ) : setupBanner.actionLabel ? (
                  <CardFooter className="border-t-0 pt-0">
                    <Button
                      disabled={snapshot.modelBusy}
                      onClick={() => {
                        void appStore.startManagedModelDownload();
                      }}
                    >
                      <span className="text-white">
                        {snapshot.modelBusy ? "Starting download..." : setupBanner.actionLabel}
                      </span>
                    </Button>
                  </CardFooter>
                ) : null}
              </Card>
            ) : meetings.length === 0 ? (
              <Card>
                <CardHeader className="items-center px-8 py-8 text-center">
                  <CardTitle>No meetings yet</CardTitle>
                  <CardDescription>
                    Create a meeting from the button above and transcripts will show up here.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <div className="space-y-3">
                {meetings.map((meeting) => {
                  const deleteDisabled = isMeetingDeleteDisabled(
                    meeting,
                    snapshot.transcriptionBusy,
                    snapshot.transcriptionRunning,
                    snapshot.recordingMeetingId,
                  );

                  return (
                    <div key={meeting.id} className="relative">
                      <Card className="transition hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(15,23,42,0.08),0_22px_46px_rgba(15,23,42,0.1)]">
                        <Button
                          type="button"
                          variant="ghost"
                          className="absolute inset-0 z-10 h-auto w-full rounded-[calc(var(--radius)+2px)] border-transparent bg-transparent p-0 text-left shadow-none hover:bg-transparent data-pressed:bg-transparent"
                          aria-label={`Open ${meeting.title}`}
                          onClick={() => {
                            navigate({
                              to: "/meeting/$meetingId",
                              params: { meetingId: meeting.id },
                            });
                          }}
                          onContextMenu={(event) => {
                            void showNativeContextMenu(
                              getMeetingActionMenuItems(meeting, deleteDisabled, setMeetingPendingDelete),
                              event,
                            );
                          }}
                        />
                        <CardPanel className="p-4">
                          <div className="flex min-w-0 flex-col gap-1.5">
                            <p className="text-sm text-zinc-600">{formatDateTime(meeting.createdAt)}</p>
                            <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                              {meeting.title}
                            </h2>
                          </div>
                        </CardPanel>
                      </Card>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <ScrollFade
          className="mx-4"
          tone="background"
          showTop={homeScrollFade.showTop}
          showBottom={homeScrollFade.showBottom}
        />
      </div>
      <DeleteMeetingDialog
        meeting={meetingPendingDelete}
        onCancel={() => {
          setMeetingPendingDelete(null);
        }}
        onConfirm={(meetingId) => {
          setMeetingPendingDelete(null);
          void appStore.deleteMeeting(meetingId);
        }}
      />
    </section>
  );
}

function MeetingTitleField({
  meetingId,
  title,
}: {
  meetingId: string;
  title: string;
}) {
  const [draft, setDraft] = useState(title);

  return (
    <input
      value={draft}
      spellCheck={false}
      aria-label="Meeting title"
      className="w-full bg-transparent text-[56px] leading-[1.05] font-semibold tracking-[-0.045em] text-zinc-950 outline-none"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        appStore.updateMeetingTitle(meetingId, draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          appStore.updateMeetingTitle(meetingId, draft);
          event.currentTarget.blur();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function MeetingScreen() {
  const snapshot = useAppState();
  const navigate = useNavigate();
  const [meetingPendingDelete, setMeetingPendingDelete] = useState<DeleteMeetingRequest | null>(null);
  const transcriptScrollFade = useScrollFade<HTMLElement>();
  const { attachRef: attachTranscriptScrollFade, handleScroll: handleTranscriptScroll } =
    transcriptScrollFade;
  const { meetingId } = useParams({ from: "/meeting/$meetingId" });
  const meeting = snapshot.meetings.find((candidate) => candidate.id === meetingId) ?? null;
  const attachTranscriptRef = useCallback(
    (node: HTMLElement | null) => {
      attachTranscriptScrollFade(node);

      if (!node) {
        return;
      }

      window.requestAnimationFrame(() => {
        node.scrollTop = node.scrollHeight;
      });
    },
    [attachTranscriptScrollFade],
  );

  if (!meeting) {
    return (
      <section className={cn("mx-auto flex max-w-[760px] items-center justify-center", windowShellHeightClass)}>
        <Card>
          <CardHeader className="items-center px-8 py-8 text-center">
            <CardTitle>Meeting not found</CardTitle>
            <CardDescription>
              The meeting may have been removed from local storage.
            </CardDescription>
            <Button
              variant="secondary"
              onClick={() => {
                navigate({ to: "/" });
              }}
            >
              Back home
            </Button>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const transcriptEntries = getMeetingTranscriptEntries(meeting);
  const deleteDisabled = isMeetingDeleteDisabled(
    meeting,
    snapshot.transcriptionBusy,
    snapshot.transcriptionRunning,
    snapshot.recordingMeetingId,
  );
  const isMeetingListening =
    snapshot.recordingMeetingId === meeting.id ||
    (meeting.status === "live" && snapshot.transcriptionRunning);
  const isStoppingMeeting = snapshot.transcriptionStopping && meeting.status === "live";
  const summaryReady = Boolean(snapshot.summarySettings?.ready);
  const showSummaryCard = !isMeetingListening && Boolean(meeting.summary);
  const isGeneratingSummary = snapshot.summaryMeetingId === meeting.id;
  const summaryTooltipTitle = isGeneratingSummary
    ? "Generating summary"
    : !summaryReady
      ? "AI summary setup required"
      : isMeetingListening
        ? "Stop listening first"
        : transcriptEntries.length === 0
          ? "Transcript required"
          : meeting.summary
            ? "Refresh summary"
            : "Generate summary";
  const summaryActionHint = isGeneratingSummary
    ? "Generating summary..."
    : snapshot.summaryMeetingId !== null
      ? "Another summary is already running."
      : !summaryReady
        ? "Configure AI summaries in Preferences to enable this."
        : isMeetingListening
          ? "Stop listening before generating a summary."
          : transcriptEntries.length === 0
            ? meeting.status === "live" && snapshot.modelSettings?.processingMode === "batch"
              ? "Stop listening to transcribe this meeting before generating a summary."
              : "A transcript is required before generating a summary."
            : meeting.summary
              ? "Generate a fresh summary from the current transcript."
              : "Generate a summary from the current transcript.";
  const summaryActionDisabled =
    isGeneratingSummary ||
    snapshot.summaryMeetingId !== null ||
    !summaryReady ||
    isMeetingListening ||
    transcriptEntries.length === 0;
  const emptyTranscriptCopy =
    meeting.status === "live" && snapshot.modelSettings?.processingMode === "batch"
      ? "Transcript will be generated after you stop the meeting."
      : "Transcript will appear here.";

  return (
    <section className={cn("mx-auto flex max-w-[760px] flex-col gap-5", windowShellHeightClass)}>
      <WindowDragRegion className="flex flex-col gap-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <div data-window-drag="false">
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0"
              aria-label="Back"
              onClick={() => {
                navigate({ to: "/" });
              }}
            >
              <IconBack />
            </Button>
          </div>

          <div className="min-w-0">
            <p className="truncate text-center text-sm text-zinc-600">
              {formatDateTime(meeting.createdAt)}
            </p>
          </div>

          <div data-window-drag="false">
            <Button
              variant="secondary"
              size="icon-sm"
              className="shrink-0"
              aria-label="More actions"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();

                void showNativeMenu(
                  getMeetingActionMenuItems(meeting, deleteDisabled, setMeetingPendingDelete),
                  {
                    event,
                    at: {
                      x: rect.left,
                      y: rect.bottom + 6,
                    },
                  },
                );
              }}
            >
              <IconMore />
            </Button>
          </div>
        </div>

        <div className="flex items-end gap-3">
          <div className="min-w-0 flex-1" data-window-drag="false">
            <MeetingTitleField key={meeting.id} meetingId={meeting.id} title={meeting.title} />
          </div>

          <NumberField
            className="w-[140px] shrink-0"
            data-window-drag="false"
            disabled={snapshot.transcriptionBusy || snapshot.diarizationRunBusy}
            min={1}
            step={1}
            value={meeting.requestedSpeakerCount}
            onValueChange={(value) => {
              appStore.updateMeetingRequestedSpeakerCount(
                meeting.id,
                value === null ? "" : String(value),
              );
            }}
          >
            <NumberFieldGroup className="h-8">
              <NumberFieldDecrement className="w-8" />
              <div className="grid min-w-0 flex-1 grid-cols-[auto_auto] items-center justify-center gap-1 border-x border-[color:var(--border)] px-1.5 text-zinc-500">
                <Users className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                <NumberFieldInput
                  placeholder="Auto"
                  aria-label="Participants"
                  className="w-[2.35rem] min-w-0 flex-none border-0 bg-transparent px-0 text-center text-sm placeholder:text-center"
                />
              </div>
              <NumberFieldIncrement className="w-8" />
            </NumberFieldGroup>
          </NumberField>
        </div>
      </WindowDragRegion>

      <div className="flex items-end gap-3">
        <div className="flex min-w-0 items-end justify-start">
          <Button
            size="lg"
            variant={meeting.status === "live" ? "destructive" : "outline"}
            className="min-w-[190px]"
            disabled={snapshot.transcriptionBusy}
            loading={isStoppingMeeting}
            onClick={() => {
              void appStore.toggleMeetingStatus(meeting.id);
            }}
          >
            {meeting.status === "live" ? (
              isStoppingMeeting ? "Processing audio" : "Stop listening"
            ) : (
              <>
                <LiveIndicator />
                <span>Resume listening</span>
              </>
            )}
          </Button>
        </div>

        <Tooltip>
          {summaryActionDisabled ? (
            <TooltipTrigger
              render={<span className="inline-flex shrink-0" />}
              tabIndex={0}
              aria-label={summaryTooltipTitle}
            >
              <Button
                size="lg"
                variant="outline"
                className="min-w-[176px]"
                disabled
                loading={isGeneratingSummary}
              >
                Generate summary
              </Button>
            </TooltipTrigger>
          ) : (
            <TooltipTrigger
              render={
                <Button
                  size="lg"
                  variant="outline"
                  className="min-w-[176px]"
                  onClick={() => {
                    void appStore.generateMeetingSummary(meeting.id);
                  }}
                />
              }
            >
              Generate summary
            </TooltipTrigger>
          )}
          <TooltipPopup side="bottom" align="start">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
                {summaryTooltipTitle}
              </p>
              <p>{summaryActionHint}</p>
              <Button
                size="xs"
                variant="secondary"
                className="w-full justify-center border-white/10 bg-white/10 text-white hover:bg-white/16 data-pressed:bg-white/14"
                onClick={() => {
                  void appStore.openSettingsWindow(AI_SUMMARIES_SETTINGS_SECTION);
                }}
              >
                Open preferences
              </Button>
            </div>
          </TooltipPopup>
        </Tooltip>
      </div>

      <div className="-mx-4 min-h-0 flex-1 pb-4">
        <div className="flex h-full min-h-0 flex-col gap-4">
          {showSummaryCard ? (
            <div className="px-4">
              <Card>
                <CardHeader className="flex-row items-start justify-between gap-4">
                  <div className="space-y-1">
                    <CardTitle>Summary</CardTitle>
                    <CardDescription>
                      Stored locally alongside the transcript export.
                    </CardDescription>
                  </div>
                  <CardAction>
                    <StatusBadge tone="ready">saved</StatusBadge>
                  </CardAction>
                </CardHeader>
                <CardPanel className="pt-0">
                  <div className={cn(insetPanelClass, "whitespace-pre-wrap text-sm leading-6 text-zinc-800")}>
                    {meeting.summary}
                  </div>
                </CardPanel>
                <CardFooter className="justify-start">
                  <div className="text-xs leading-5 text-zinc-500">
                    {meeting.summaryUpdatedAt ? (
                      <span>
                        {meeting.summaryProviderLabel ? `${meeting.summaryProviderLabel}` : "Summary"} ·{" "}
                        {meeting.summaryModel ?? "model"} · Updated{" "}
                        {formatDateTime(meeting.summaryUpdatedAt)}
                      </span>
                    ) : null}
                  </div>
                </CardFooter>
              </Card>
            </div>
          ) : null}

          {transcriptEntries.length === 0 ? (
            <div className="flex flex-1 px-4">
              <Card className="flex min-h-[260px] flex-1 items-center justify-center border-dotted bg-[color:var(--secondary)] px-6 text-center">
                <p className="text-sm leading-6 text-zinc-600">{emptyTranscriptCopy}</p>
              </Card>
            </div>
          ) : (
            <div className="min-h-[260px] flex-1 overflow-hidden">
              <div className="relative flex h-full min-h-0 flex-col">
                <section
                  className="flex min-h-0 flex-1 flex-col overflow-y-auto"
                  ref={attachTranscriptRef}
                  onScroll={handleTranscriptScroll}
                >
                  <div className="space-y-5 px-4 pb-2">
                    {transcriptEntries.map((entry, index) => {
                      const { speakerLabel, timestampLabel } = getTranscriptEntryMeta(
                        meeting,
                        entry,
                        index,
                      );

                      return (
                        <article
                          key={`${meeting.id}-${index}-${entry.source}-${entry.text.slice(0, 12)}`}
                          className="space-y-2 border-b border-[color:var(--border)] pb-5 last:border-b-0 last:pb-0"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                            <span className="text-zinc-700">{speakerLabel}</span>
                            {timestampLabel ? <span>[{timestampLabel}]</span> : null}
                          </div>
                          <p className="whitespace-pre-wrap text-[15px] leading-8 text-zinc-800">
                            {entry.text}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                </section>
                <ScrollFade
                  tone="background"
                  showTop={transcriptScrollFade.showTop}
                  showBottom={transcriptScrollFade.showBottom}
                />
              </div>
            </div>
          )}

          {snapshot.meetingNote ? (
            <p className="text-sm text-rose-700">{snapshot.meetingNote}</p>
          ) : null}
        </div>
      </div>
      <DeleteMeetingDialog
        meeting={meetingPendingDelete}
        onCancel={() => {
          setMeetingPendingDelete(null);
        }}
        onConfirm={(targetMeetingId) => {
          setMeetingPendingDelete(null);
          void appStore.deleteMeeting(targetMeetingId);
        }}
      />
    </section>
  );
}

function SettingsScreen() {
  const snapshot = useAppState();
  const settingsReady = Boolean(snapshot.generalSettings && snapshot.summarySettings && snapshot.modelSettings);
  const [targetSettingsSection, setTargetSettingsSection] = useState<string | null>(() =>
    readTargetSettingsSection(),
  );
  const settingsLoadNote =
    snapshot.permissionNote || snapshot.generalNote || snapshot.summaryNote;
  const settingsContentWidthClass = isSettingsWindow ? "max-w-[640px]" : "max-w-[760px]";
  const settingsShellHeightClass = isSettingsWindow ? "h-screen" : windowShellHeightClass;
  const settingsContentInsetClass = "px-5 pt-5 pb-6";

  useEffect(() => {
    const syncTargetSection = () => {
      setTargetSettingsSection(readTargetSettingsSection());
    };

    syncTargetSection();
    window.addEventListener("hashchange", syncTargetSection);

    return () => {
      window.removeEventListener("hashchange", syncTargetSection);
    };
  }, []);

  useEffect(() => {
    if (!settingsReady || targetSettingsSection !== AI_SUMMARIES_SETTINGS_SECTION) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      scrollSettingsSectionIntoView(targetSettingsSection);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [settingsReady, targetSettingsSection]);

  if (!snapshot.generalSettings || !snapshot.summarySettings || !snapshot.modelSettings) {
    return (
      <section className={cn("mx-auto flex items-center", settingsContentWidthClass, settingsShellHeightClass)}>
        <Card className="w-full">
          <CardHeader className="px-8 py-8">
            <CardTitle>{settingsLoadNote ? "Could not load settings" : "Loading preferences..."}</CardTitle>
            <CardDescription>
              {settingsLoadNote || "Loading preferences..."}
            </CardDescription>
          </CardHeader>
          {settingsLoadNote ? (
            <CardFooter className="pt-0">
              <Button
                variant="secondary"
                onClick={() => {
                  void appStore.refreshSettingsWindowData();
                }}
              >
                Retry
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      </section>
    );
  }

  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const modelSettings = snapshot.modelSettings;
  const timezoneOptions = getTimezoneOptions(snapshot);
  const modelReady = Boolean(modelSettings.selectedReady);
  const downloadStatus = snapshot.modelDownload?.status ?? "idle";
  const showModelDownloadGauge = snapshot.modelBusy || downloadStatus === "downloading";
  const modelStatusLabel =
    downloadStatus === "downloading"
      ? "downloading"
      : modelReady
        ? "ready"
        : "needs setup";
  const modelStatusTone = downloadStatus === "downloading" ? "missing" : modelReady ? "ready" : "missing";
  const setupBanner = currentSetupBannerContent(snapshot);
  const selectedModel = modelSettings.availableModels.find(
    (option) => option.id === modelSettings.selectedModelId,
  );
  const batchModelOptions = modelSettings.availableModels
    .filter((option) => option.processingMode === "batch")
    .map((option) => ({
      value: option.id,
      label: option.label,
      detail: option.sizeLabel,
    }));
  const recommendedModel = modelSettings.availableModels.find(
    (option) => option.id === modelSettings.recommendedModelId,
  );
  const selectedSummaryProvider = getSummaryProviderDefinition(snapshot.summaryDraft.provider);
  const summaryStatusLabel = !snapshot.summarySettings.provider
    ? "off"
    : snapshot.summarySettings.ready
      ? "ready"
      : "needs setup";
  const summaryStatusTone = !snapshot.summarySettings.provider
    ? "off"
    : snapshot.summarySettings.ready
      ? "ready"
      : "missing";
  const summarySettingsDirty =
    snapshot.summaryDraft.provider !== snapshot.summarySettings.provider ||
    snapshot.summaryDraft.model.trim() !== snapshot.summarySettings.model.trim() ||
    snapshot.summaryDraft.baseUrl.trim() !== snapshot.summarySettings.baseUrl.trim() ||
    snapshot.summaryDraft.apiKeyDirty;
  const apiKeyPlaceholder =
    snapshot.summaryDraft.apiKeyPresent && !snapshot.summaryDraft.apiKeyDirty
      ? "API key saved"
      : selectedSummaryProvider?.requiresApiKey
        ? "Paste API key"
        : "Optional API key";

  return (
    <section className={cn("flex min-h-0 flex-col", settingsShellHeightClass)}>
      <div className="relative -mx-4 min-h-0 flex-1">
        <div className="h-full overflow-y-auto">
          <div className={cn("mx-auto flex flex-col gap-6", settingsContentWidthClass, settingsContentInsetClass)}>
            <Card id={AI_SUMMARIES_SETTINGS_SECTION_ID} className="overflow-visible">
              <CardHeader>
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Main language</p>
                  <SearchableSelect
                    ariaLabel="Main language"
                    value={snapshot.generalDraft.mainLanguage}
                    onChange={appStore.setMainLanguage}
                    options={LANGUAGE_OPTIONS}
                    placeholder="Select language"
                    searchPlaceholder="Search language..."
                    disabled={snapshot.generalBusy}
                  />
                </div>

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Timezone</p>
                  <SearchableSelect
                    ariaLabel="Timezone"
                    value={snapshot.generalDraft.timezone || systemTimezone}
                    onChange={(nextValue) => {
                      appStore.setTimezone(nextValue === systemTimezone ? "" : nextValue);
                    }}
                    options={timezoneOptions}
                    placeholder={`System default (${systemTimezone})`}
                    searchPlaceholder="Search timezone..."
                    disabled={snapshot.generalBusy}
                  />
                </div>

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Spoken languages</p>
                  <SpokenLanguagesCombobox
                    mainLanguage={snapshot.generalDraft.mainLanguage}
                    value={snapshot.generalDraft.spokenLanguages}
                    disabled={snapshot.generalBusy}
                    onAdd={appStore.addSpokenLanguage}
                    onRemove={appStore.removeSpokenLanguage}
                  />
                </div>
              </CardPanel>
            </Card>

            <Card className="overflow-visible">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <CardTitle>Transcription model</CardTitle>
                <CardAction>
                  <StatusBadge tone={modelStatusTone}>{modelStatusLabel}</StatusBadge>
                </CardAction>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Processing mode</p>
                  <SearchableSelect
                    ariaLabel="Processing mode"
                    value={snapshot.modelSettings.processingMode}
                    onChange={(nextValue) => {
                      appStore.setProcessingMode(nextValue as "realtime" | "batch");
                    }}
                    options={PROCESSING_MODE_OPTIONS}
                    placeholder="Select mode"
                    searchPlaceholder="Search mode..."
                    disabled={snapshot.modelBusy || downloadStatus === "downloading"}
                  />
                </div>

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Batch model</p>
                  <SearchableSelect
                    ariaLabel="Batch model"
                    value={snapshot.modelSettings.batchModelId}
                    onChange={(nextValue) => {
                      appStore.setBatchModel(nextValue as typeof snapshot.modelSettings.batchModelId);
                    }}
                    options={batchModelOptions}
                    placeholder="Select batch model"
                    searchPlaceholder="Search model..."
                    disabled={snapshot.modelBusy || downloadStatus === "downloading"}
                  />
                </div>

                <div className={cn(insetPanelClass, "space-y-3")}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                        Active model
                      </p>
                      <p className="mt-1 text-sm font-semibold text-zinc-950">
                        {snapshot.modelSettings.selectedModelLabel}
                      </p>
                    </div>
                    <Badge variant="secondary">
                      {snapshot.modelSettings.deviceProfile.chipLabel} · {snapshot.modelSettings.deviceProfile.memoryGb} GB
                    </Badge>
                  </div>

                  <p className="text-sm leading-6 text-zinc-600">
                    {modelReady
                      ? snapshot.modelSettings.selectedModelStatus
                      : setupBanner?.copy ?? snapshot.modelSettings.selectedModelStatus}
                  </p>

                  <p className="text-sm text-zinc-500">
                    {selectedModel?.detail} · {snapshot.modelSettings.selectedModelLanguagesLabel} ·{" "}
                    {snapshot.modelSettings.selectedModelSizeLabel}
                  </p>

                  <div className="rounded-[calc(var(--radius)-6px)] border border-[color:var(--border)] bg-white/70 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Recommendation
                    </p>
                    <p className="mt-1 text-sm font-semibold text-zinc-950">
                      {recommendedModel?.label ?? snapshot.modelSettings.selectedModelLabel}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-zinc-600">
                      {snapshot.modelSettings.recommendationReason}
                    </p>
                  </div>

                  {setupBanner?.detail ? (
                    <p className="text-sm text-zinc-500">{setupBanner.detail}</p>
                  ) : null}
                </div>

                <p className="text-sm leading-6 text-zinc-600">
                  Model id: <code>{snapshot.modelSettings.selectedModelRepo}</code>
                </p>

                {(snapshot.modelDownload?.localPath || snapshot.modelSettings.selectedModelLocalPath) ? (
                  <div className={cn(insetPanelClass)}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Storage
                    </p>
                    <code className="mt-1 block break-all text-xs text-zinc-700">
                      {snapshot.modelDownload?.localPath || snapshot.modelSettings.selectedModelLocalPath}
                    </code>
                  </div>
                ) : null}
              </CardPanel>
              {!modelReady ? (
                <CardFooter className="border-t-0 pt-0">
                  {showModelDownloadGauge ? (
                    <ModelDownloadGauge busy={snapshot.modelBusy} download={snapshot.modelDownload} />
                  ) : (
                    <Button
                      disabled={snapshot.modelBusy}
                      onClick={() => {
                        void appStore.startManagedModelDownload();
                      }}
                    >
                      Download model
                    </Button>
                  )}
                </CardFooter>
              ) : null}
            </Card>

            <Card className="overflow-visible">
              <CardHeader className="flex-row items-start justify-between gap-4">
                <CardTitle>AI summaries</CardTitle>
                <CardAction>
                  <StatusBadge tone={summaryStatusTone}>{summaryStatusLabel}</StatusBadge>
                </CardAction>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Provider</p>
                  <SearchableSelect
                    ariaLabel="Summary provider"
                    value={snapshot.summaryDraft.provider}
                    onChange={appStore.setSummaryProvider}
                    options={summaryProviderOptions}
                    placeholder="Select provider"
                    searchPlaceholder="Search provider..."
                    disabled={snapshot.summaryBusy}
                  />
                </div>

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Model</p>
                  <Input
                    value={snapshot.summaryDraft.model}
                    onChange={(event) => {
                      appStore.setSummaryModel(event.target.value);
                    }}
                    placeholder={selectedSummaryProvider?.modelPlaceholder ?? "Model id"}
                    disabled={snapshot.summaryBusy || !snapshot.summaryDraft.provider}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-zinc-950">Base URL</p>
                  <Input
                    className="mt-3"
                    value={snapshot.summaryDraft.baseUrl}
                    onChange={(event) => {
                      appStore.setSummaryBaseUrl(event.target.value);
                    }}
                    placeholder={selectedSummaryProvider?.defaultBaseUrl || "https://example.com/v1"}
                    disabled={snapshot.summaryBusy || !snapshot.summaryDraft.provider}
                  />
                </div>

                <div>
                  <p className="text-sm font-semibold text-zinc-950">API key</p>
                  <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <Input
                      className="flex-1"
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      value={snapshot.summaryDraft.apiKey}
                      onChange={(event) => {
                        appStore.setSummaryApiKey(event.target.value);
                      }}
                      placeholder={apiKeyPlaceholder}
                      disabled={snapshot.summaryBusy || !snapshot.summaryDraft.provider}
                    />
                    {snapshot.summaryDraft.apiKeyPresent ? (
                      <Button
                        variant="secondary"
                        disabled={snapshot.summaryBusy}
                        onClick={() => {
                          void appStore.removeSummaryApiKey();
                        }}
                      >
                        Remove saved key
                      </Button>
                    ) : null}
                  </div>
                </div>

                {selectedSummaryProvider?.help ? (
                  <div className={cn(insetPanelClass, "space-y-2")}>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Provider notes
                    </p>
                    <p className="text-sm leading-6 text-zinc-600">{selectedSummaryProvider.help}</p>
                    {snapshot.summaryDraft.provider ? (
                      <code className="block break-all text-xs text-zinc-700">
                        {snapshot.summaryDraft.baseUrl.trim() ||
                          selectedSummaryProvider.defaultBaseUrl ||
                          "Custom base URL required"}
                      </code>
                    ) : null}
                  </div>
                ) : null}
              </CardPanel>
              <CardFooter className="justify-between">
                <p className="text-sm text-zinc-500">{snapshot.summarySettings.status}</p>
                <Button
                  disabled={snapshot.summaryBusy || !summarySettingsDirty}
                  loading={snapshot.summaryBusy}
                  onClick={() => {
                    void appStore.saveSummarySettings();
                  }}
                >
                  Save summary settings
                </Button>
              </CardFooter>
            </Card>

            {snapshot.generalNote ? (
              <p className="text-sm text-rose-700">{snapshot.generalNote}</p>
            ) : null}
            {snapshot.summaryNote ? (
              <p className="text-sm text-rose-700">{snapshot.summaryNote}</p>
            ) : null}
            {snapshot.permissionNote ? (
              <p className="text-sm text-rose-700">{snapshot.permissionNote}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: HomeScreen,
});

const meetingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/meeting/$meetingId",
  component: MeetingScreen,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsScreen,
});

const routeTree = rootRoute.addChildren([homeRoute, meetingRoute, settingsRoute]);

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouter() {
  return <RouterProvider router={router} />;
}
