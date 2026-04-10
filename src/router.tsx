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
import { ChevronDown, ChevronLeft } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useMemo, useState } from "react";

import brandWordmark from "./assets/brand-wordmark.svg";
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
  cn,
} from "./components/ui";
import {
  LANGUAGE_OPTIONS,
  NEW_MEETING_SHORTCUT,
  appStore,
  currentSetupBannerContent,
  formatClockSeconds,
  formatDateTime,
  getMeetingTranscriptLines,
  getTimezoneOptions,
  isSettingsWindow,
  requiresAppSetup,
  sortedMeetings,
  useAppState,
} from "./store";
import { showNativeContextMenu } from "./hooks/useNativeContextMenu";

function IconChevronDown() {
  return <ChevronDown className="size-4 opacity-60" strokeWidth={1.5} aria-hidden="true" />;
}

function IconBack() {
  return <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden="true" />;
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

const insetPanelClass =
  "rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-4 py-3";
const emptyStateClass =
  "rounded-[var(--radius)] border border-dashed border-[color:var(--border-strong)] bg-[color:var(--secondary)] px-6 py-8 text-center";
const windowShellHeightClass = "h-[calc(100vh-4.75rem)]";

type SearchableOption = {
  value: string;
  label: string;
  detail?: string;
};

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
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius)-8px)] px-3 py-2 text-left text-sm text-zinc-900 transition",
                    index === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50",
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
                </button>
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
            <button
              type="button"
              className="text-zinc-500 transition hover:text-zinc-900"
              onClick={() => onRemove(language)}
              disabled={disabled}
            >
              <IconClose />
            </button>
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
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-[calc(var(--radius)-8px)] px-3 py-2 text-left text-sm text-zinc-900 transition",
                  index === activeIndex ? "bg-zinc-100" : "hover:bg-zinc-50",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addOption(option.value)}
              >
                <span>{option.label}</span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                  {option.value}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function RootLayout() {
  return (
    <div className="relative isolate min-h-screen w-full px-4 pb-5 pt-14 text-zinc-900">
      <div data-tauri-drag-region className="absolute inset-x-0 top-0 h-12" />
      <Outlet />
    </div>
  );
}

function HomeScreen() {
  const snapshot = useAppState();
  const navigate = useNavigate();
  const meetings = sortedMeetings(snapshot.meetings);
  const setupBanner = currentSetupBannerContent(snapshot);

  return (
    <section className={cn("mx-auto flex max-w-[780px] flex-col gap-4", windowShellHeightClass)}>
      <header className="flex items-center justify-between gap-4">
        <BrandWordmark className="shrink-0" />
        <Button
          size="lg"
          className="gap-3 px-5"
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
            <span className="inline-flex size-2 rounded-full bg-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]" />
            <span>{snapshot.startMeetingBusy ? "Starting..." : "New meeting"}</span>
          </span>
          <Kbd className="border-white/10 bg-white/10 text-white/80">{NEW_MEETING_SHORTCUT}</Kbd>
        </Button>
      </header>

      <div
        id="home-content"
        className="-mx-4 flex-1 overflow-y-auto px-4 pt-4 pr-5 pb-4"
        ref={(node) => {
          if (node) {
            node.scrollTop = snapshot.homeScrollTop;
          }
        }}
        onScroll={(event) => {
          appStore.setHomeScrollTop(event.currentTarget.scrollTop);
        }}
      >
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
            {setupBanner.actionLabel ? (
              <CardFooter className="border-t-0 pt-0">
                <Button
                  disabled={snapshot.modelBusy}
                  onClick={() => {
                    void appStore.startManagedModelDownload();
                  }}
                >
                  {snapshot.modelBusy ? "Starting download..." : setupBanner.actionLabel}
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
              const deleteDisabled =
                snapshot.transcriptionBusy ||
                snapshot.recordingMeetingId === meeting.id ||
                meeting.status === "live";

              return (
                <button
                  key={meeting.id}
                  type="button"
                  className="w-full text-left"
                  onClick={() => {
                    navigate({
                      to: "/meeting/$meetingId",
                      params: { meetingId: meeting.id },
                    });
                  }}
                  onContextMenu={(event) => {
                    void showNativeContextMenu(
                      [
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
                            if (
                              !window.confirm(
                                `Delete "${meeting.title}" from unsigned {char}? This also removes its saved markdown export.`,
                              )
                            ) {
                              return;
                            }

                            void appStore.deleteMeeting(meeting.id);
                          },
                        },
                      ],
                      event,
                    );
                  }}
                >
                  <Card className="transition hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(15,23,42,0.08),0_22px_46px_rgba(15,23,42,0.1)]">
                    <CardPanel className="p-4">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="text-sm text-zinc-600">{formatDateTime(meeting.createdAt)}</p>
                        <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                          {meeting.title}
                        </h2>
                      </div>
                    </CardPanel>
                  </Card>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className={cn("self-center", snapshot.homeScrollTop > 40 ? "opacity-100" : "opacity-0")}
        onClick={() => {
          const scroller = document.querySelector<HTMLElement>("#home-content");
          scroller?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Go to top
      </Button>
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
      className="w-full bg-transparent text-[clamp(1.5rem,2vw,2rem)] font-semibold tracking-[-0.04em] text-zinc-950 outline-none"
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
  const { meetingId } = useParams({ from: "/meeting/$meetingId" });
  const meeting = snapshot.meetings.find((candidate) => candidate.id === meetingId) ?? null;

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

  const transcriptLines = getMeetingTranscriptLines(meeting);
  const diarizationEnabled = Boolean(snapshot.diarizationSettings?.enabled);
  const diarizationReady = Boolean(snapshot.diarizationSettings?.enabled && snapshot.diarizationSettings.ready);
  const diarizationStatusTone = !diarizationEnabled ? "off" : diarizationReady ? "ready" : "missing";
  const diarizationStatusLabel =
    !diarizationEnabled ? "off" : diarizationReady ? "ready" : "needs setup";

  return (
    <section
      className={cn("mx-auto flex max-w-[760px] flex-col gap-4 overflow-y-auto pr-1", windowShellHeightClass)}
    >
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0"
            aria-label="Back"
            onClick={() => {
              navigate({ to: "/" });
            }}
          >
            <IconBack />
          </Button>
          <p className="text-sm text-zinc-600">{formatDateTime(meeting.createdAt)}</p>
        </div>

        <div className="min-w-0 pl-[3.25rem]">
          <MeetingTitleField key={meeting.id} meetingId={meeting.id} title={meeting.title} />
        </div>
      </header>

      <div className="flex items-center justify-start">
        <Button
          variant={meeting.status === "live" ? "destructive" : "outline"}
          disabled={snapshot.transcriptionBusy}
          onClick={() => {
            void appStore.toggleMeetingStatus(meeting.id);
          }}
        >
          {meeting.status === "live" ? (
            "End live"
          ) : (
            <>
              <span className="inline-flex size-2 rounded-full bg-rose-400 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]" />
              <span>Resume listening</span>
            </>
          )}
        </Button>
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <section
          className="h-full overflow-y-auto p-4"
          ref={(node) => {
            if (!node) {
              return;
            }

            window.requestAnimationFrame(() => {
              node.scrollTop = node.scrollHeight;
            });
          }}
        >
          {transcriptLines.length === 0 ? (
            <div className={emptyStateClass}>
              <p className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Live transcript</p>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                Start speaking and your microphone transcript will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {transcriptLines.map((line, index) => (
                <article
                  key={`${meeting.id}-${index}-${line.slice(0, 12)}`}
                  className="grid grid-cols-[auto,minmax(0,1fr)] gap-3 rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-4 py-3"
                >
                  <span className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                    {index + 1}
                  </span>
                  <p className="text-sm leading-6 text-zinc-800">{line}</p>
                </article>
              ))}
            </div>
          )}
        </section>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Diarization
            </p>
            <CardTitle className="text-xl">Speaker turns</CardTitle>
          </div>
          <CardAction>
            <StatusBadge tone={diarizationStatusTone}>{diarizationStatusLabel}</StatusBadge>
          </CardAction>
        </CardHeader>

        <CardPanel className="pt-0">
          <p className="text-sm leading-6 text-zinc-600">
            {diarizationReady
              ? "The app runs pyannote.audio locally against the file path below after the meeting ends. Add a speaker count if you want to lock the diarization pass to a specific number of speakers."
              : snapshot.diarizationSettings?.status ?? "Speaker diarization is not ready yet."}
          </p>

          <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Audio file path
              </span>
              <Input
                uiSize="lg"
                className="mt-2"
                value={meeting.audioPath}
                onChange={(event) => {
                  appStore.updateMeetingAudioPath(meeting.id, event.target.value);
                }}
                placeholder="~/Recordings/meeting.wav"
              />
            </label>

            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Speaker count
              </span>
              <Input
                type="number"
                uiSize="lg"
                min={1}
                step={1}
                inputMode="numeric"
                value={meeting.requestedSpeakerCount ?? ""}
                onChange={(event) => {
                  appStore.updateMeetingRequestedSpeakerCount(meeting.id, event.target.value);
                }}
                placeholder="Auto"
                className="mt-2"
              />
            </label>
          </div>

          <div className="mt-4">
            <Button
              variant="secondary"
              disabled={snapshot.diarizationRunBusy}
              onClick={() => {
                void appStore.runMeetingDiarization(meeting.id);
              }}
            >
              {snapshot.diarizationRunBusy ? "Running..." : "Run diarization"}
            </Button>
          </div>

          <p className="mt-4 text-sm leading-6 text-zinc-600">
            {meeting.diarizationRanAt
              ? `${meeting.diarizationSpeakerCount} speakers across ${meeting.diarizationSegments.length} segments · ${formatDateTime(meeting.diarizationRanAt)}`
              : diarizationEnabled
                ? "Add an audio file path and the app will run diarization automatically after the meeting ends."
                : "Speaker diarization is not available in this build yet."}
          </p>

          {meeting.diarizationPipelineSource ? (
            <div className={cn("mt-4", insetPanelClass)}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Last pipeline source
              </p>
              <code className="mt-1 block break-all text-xs text-zinc-700">
                {meeting.diarizationPipelineSource}
              </code>
            </div>
          ) : null}

          <div className="mt-4">
            {meeting.diarizationSegments.length === 0 ? (
              <div className={emptyStateClass}>
                <p className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">No speaker turns yet</p>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {meeting.audioPath
                    ? "Finish the meeting to run diarization automatically, or run it manually now."
                    : "Add an audio file path to run local diarization for this meeting."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {meeting.diarizationSegments.map((segment, index) => (
                  <article
                    key={`${segment.speaker}-${segment.startSeconds}-${segment.endSeconds}`}
                    className="rounded-[var(--radius)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-4 py-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm font-semibold text-zinc-950">{segment.speaker}</strong>
                      <span className="text-xs uppercase tracking-[0.12em] text-zinc-500">
                        {formatClockSeconds(segment.startSeconds)}-{formatClockSeconds(segment.endSeconds)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-zinc-500">
                      Segment {index + 1}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </CardPanel>
      </Card>

      {snapshot.meetingNote ? (
        <p className="text-sm text-rose-700">{snapshot.meetingNote}</p>
      ) : null}
    </section>
  );
}

function SettingsScreen() {
  const snapshot = useAppState();

  if (!snapshot.generalSettings) {
    return (
      <section className={cn("mx-auto flex max-w-[760px] items-center", windowShellHeightClass)}>
        <Card className="w-full">
          <CardHeader className="px-8 py-8">
            <CardDescription>Loading preferences...</CardDescription>
          </CardHeader>
        </Card>
      </section>
    );
  }

  const systemTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneOptions = getTimezoneOptions(snapshot);
  const modelReady = Boolean(snapshot.modelSettings?.selectedReady);
  const downloadStatus = snapshot.modelDownload?.status ?? "idle";
  const modelStatusLabel =
    downloadStatus === "downloading"
      ? "downloading"
      : modelReady
        ? "ready"
        : "needs setup";
  const modelStatusTone = downloadStatus === "downloading" ? "missing" : modelReady ? "ready" : "missing";
  const setupBanner = currentSetupBannerContent(snapshot);

  return (
    <section
      className={cn(
        "mx-auto flex flex-col gap-6 overflow-y-auto",
        windowShellHeightClass,
        isSettingsWindow ? "max-w-[640px]" : "max-w-[760px]",
      )}
    >
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle>Transcription model</CardTitle>
            <CardDescription>
              Download Qwen3-ASR once and keep it local to this Mac for offline transcription.
            </CardDescription>
          </div>
          <CardAction>
            <StatusBadge tone={modelStatusTone}>{modelStatusLabel}</StatusBadge>
          </CardAction>
        </CardHeader>
        <CardPanel className="pt-0">
          <p className="text-sm leading-6 text-zinc-600">
            {modelReady
              ? snapshot.modelSettings?.huggingFaceStatus ?? "Local transcription model is ready."
              : setupBanner?.copy ?? "Download the local transcription model to continue."}
          </p>

          {setupBanner?.detail ? (
            <p className="mt-3 text-sm text-zinc-500">{setupBanner.detail}</p>
          ) : null}

          {(snapshot.modelDownload?.localPath || snapshot.modelSettings?.huggingFaceLocalPath) ? (
            <div className={cn("mt-4", insetPanelClass)}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                Storage
              </p>
              <code className="mt-1 block break-all text-xs text-zinc-700">
                {snapshot.modelDownload?.localPath || snapshot.modelSettings?.huggingFaceLocalPath}
              </code>
            </div>
          ) : null}
        </CardPanel>
        {!modelReady ? (
          <CardFooter className="border-t-0 pt-0">
            <Button
              disabled={snapshot.modelBusy || downloadStatus === "downloading"}
              onClick={() => {
                void appStore.startManagedModelDownload();
              }}
            >
              {snapshot.modelBusy || downloadStatus === "downloading"
                ? "Starting download..."
                : "Download model"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Language and timeline defaults for the local app.</CardDescription>
        </CardHeader>
        <CardPanel className="grid gap-6 pt-0">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),180px] md:items-center">
            <div>
              <p className="text-sm font-semibold text-zinc-950">Main language</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Language for summaries, chats, and AI-generated responses
              </p>
            </div>
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

          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr),220px] md:items-center">
            <div>
              <p className="text-sm font-semibold text-zinc-950">Timezone</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Override the timezone used for the sidebar timeline
              </p>
            </div>
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

          <div>
            <div>
              <p className="text-sm font-semibold text-zinc-950">Spoken languages</p>
              <p className="mt-1 text-sm leading-6 text-zinc-600">
                Add other languages you use other than the main language
              </p>
            </div>
            <div className="mt-4">
              <SpokenLanguagesCombobox
                mainLanguage={snapshot.generalDraft.mainLanguage}
                value={snapshot.generalDraft.spokenLanguages}
                disabled={snapshot.generalBusy}
                onAdd={appStore.addSpokenLanguage}
                onRemove={appStore.removeSpokenLanguage}
              />
            </div>
          </div>
        </CardPanel>
      </Card>

      {snapshot.generalNote ? (
        <p className="text-sm text-rose-700">{snapshot.generalNote}</p>
      ) : null}
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
