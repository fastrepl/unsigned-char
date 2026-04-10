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

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

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
  return <img src={brandWordmark} alt="unsigned {char}" className={cn("block h-7 w-auto", className)} />;
}

function Surface({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[20px] border border-white/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.62)_0%,rgba(255,255,255,0.2)_40%,rgba(255,255,255,0.12)_100%),linear-gradient(135deg,rgba(255,255,255,0.76)_0%,rgba(255,255,255,0.22)_28%,rgba(255,255,255,0)_56%)] shadow-[0_28px_60px_rgba(15,23,42,0.08)] backdrop-blur-[24px]",
        className,
      )}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-950/90 bg-zinc-950 px-4 text-sm font-medium text-white shadow-[0_16px_30px_rgba(24,24,27,0.18)] transition hover:-translate-y-px hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-900/10 bg-white/65 px-4 text-sm font-medium text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)] backdrop-blur-[22px] transition hover:-translate-y-px hover:border-zinc-900/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

function GhostButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-zinc-900/10 bg-white/45 px-4 text-sm font-medium text-zinc-900 backdrop-blur-[22px] transition hover:-translate-y-px hover:border-zinc-900/20 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  tone,
  children,
}: {
  tone: "ready" | "missing" | "off" | "live" | "done";
  children: ReactNode;
}) {
  const styles = {
    ready: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700",
    missing: "border-amber-500/20 bg-amber-500/12 text-amber-700",
    off: "border-zinc-900/10 bg-white/55 text-zinc-600",
    live: "border-rose-500/20 bg-rose-500/10 text-rose-700",
    done: "border-zinc-900/10 bg-white/55 text-zinc-700",
  } satisfies Record<string, string>;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
        styles[tone],
      )}
    >
      {children}
    </span>
  );
}

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
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        className="inline-flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-zinc-900/10 bg-white/70 px-4 text-left text-sm text-zinc-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-[22px] disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => {
          if (disabled) {
            return;
          }

          setOpen((current) => !current);
          setQuery("");
          setActiveIndex(0);
        }}
      >
        <span className="truncate">
          {selectedOption
            ? selectedOption.detail
              ? `${selectedOption.label} (${selectedOption.detail})`
              : selectedOption.label
            : placeholder}
        </span>
        <IconChevronDown />
      </button>

      {open ? (
        <Surface className="absolute inset-x-0 top-[calc(100%+8px)] z-20 p-2">
          <input
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder={searchPlaceholder}
            className="mb-2 min-h-10 w-full rounded-xl border border-zinc-900/8 bg-white/75 px-3 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
          />
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-900 transition",
                    index === activeIndex ? "bg-zinc-900/8" : "hover:bg-zinc-900/5",
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
        </Surface>
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
          "flex min-h-12 flex-wrap items-center gap-2 rounded-2xl border border-zinc-900/10 bg-white/70 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] backdrop-blur-[22px]",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        {value.map((language) => (
          <span
            key={language}
            className="inline-flex items-center gap-2 rounded-full border border-zinc-900/10 bg-white/75 px-3 py-1 text-xs font-medium text-zinc-900"
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
          </span>
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
        <Surface className="absolute inset-x-0 top-[calc(100%+8px)] z-20 p-2">
          <div className="max-h-60 overflow-y-auto">
            {filteredOptions.map((option, index) => (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm text-zinc-900 transition",
                  index === activeIndex ? "bg-zinc-900/8" : "hover:bg-zinc-900/5",
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
        </Surface>
      ) : null}
    </div>
  );
}

function RootLayout() {
  return (
    <div className="min-h-screen w-full px-4 py-5 text-zinc-900">
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
    <section className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[760px] flex-col gap-4">
      <header className="flex items-center justify-between gap-4">
        <BrandWordmark className="shrink-0" />
        <PrimaryButton
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
            <span className="text-white">{snapshot.startMeetingBusy ? "Starting..." : "New meeting"}</span>
          </span>
          <span className="text-xs text-white/70">{NEW_MEETING_SHORTCUT}</span>
        </PrimaryButton>
      </header>

      <div
        id="home-content"
        className="-mx-4 flex-1 overflow-y-auto px-4 pr-5"
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
          <Surface className="mb-4 p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              {setupBanner.kicker}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.03em] text-zinc-950">
              {setupBanner.title}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-600">{setupBanner.copy}</p>
            <p className="mt-3 text-sm text-zinc-500">{setupBanner.detail}</p>
            {setupBanner.localPath ? (
              <div className="mt-4 rounded-2xl border border-zinc-900/8 bg-white/55 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                  Storage
                </p>
                <code className="mt-1 block break-all text-xs text-zinc-700">
                  {setupBanner.localPath}
                </code>
              </div>
            ) : null}
            {setupBanner.actionLabel ? (
              <div className="mt-5">
                <PrimaryButton
                  disabled={snapshot.modelBusy}
                  onClick={() => {
                    void appStore.startManagedModelDownload();
                  }}
                >
                  {snapshot.modelBusy ? "Starting download..." : setupBanner.actionLabel}
                </PrimaryButton>
              </div>
            ) : null}
          </Surface>
        ) : meetings.length === 0 ? (
          <Surface className="p-8 text-center">
            <p className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">No meetings yet</p>
            <p className="mt-2 text-sm leading-6 text-zinc-600">
              Create a meeting from the button above and transcripts will show up here.
            </p>
          </Surface>
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
                  <Surface className="p-4 transition hover:-translate-y-px">
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <p className="text-sm text-zinc-600">{formatDateTime(meeting.createdAt)}</p>
                        <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                          {meeting.title}
                        </h2>
                      </div>
                    </div>
                  </Surface>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <GhostButton
        className={cn("self-center", snapshot.homeScrollTop > 40 ? "opacity-100" : "opacity-0")}
        onClick={() => {
          const scroller = document.querySelector<HTMLElement>("#home-content");
          scroller?.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        Go to top
      </GhostButton>
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
      <section className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[760px] items-center justify-center">
        <Surface className="p-8 text-center">
          <p className="text-lg font-semibold tracking-[-0.02em] text-zinc-950">Meeting not found</p>
          <p className="mt-2 text-sm text-zinc-600">
            The meeting may have been removed from local storage.
          </p>
          <div className="mt-5">
            <SecondaryButton
              onClick={() => {
                navigate({ to: "/" });
              }}
            >
              Back home
            </SecondaryButton>
          </div>
        </Surface>
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
    <section className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[760px] flex-col gap-4 overflow-y-auto pr-1">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <GhostButton
            className="size-10 shrink-0 px-0"
            aria-label="Back"
            onClick={() => {
              navigate({ to: "/" });
            }}
          >
            <IconBack />
          </GhostButton>
          <p className="text-sm text-zinc-600">{formatDateTime(meeting.createdAt)}</p>
        </div>

        <div className="min-w-0 pl-[3.25rem]">
          <MeetingTitleField key={meeting.id} meetingId={meeting.id} title={meeting.title} />
        </div>
      </header>

      <div className="flex items-center justify-start">
        <GhostButton
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
        </GhostButton>
      </div>

      <Surface className="min-h-0 flex-1 overflow-hidden">
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
            <div className="rounded-2xl border border-dashed border-zinc-900/10 bg-white/35 px-6 py-8 text-center">
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
                  className="grid grid-cols-[auto,minmax(0,1fr)] gap-3 rounded-2xl border border-zinc-900/8 bg-white/35 px-4 py-3"
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
      </Surface>

      <Surface className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Diarization
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em] text-zinc-950">
              Speaker turns
            </h2>
          </div>
          <StatusBadge tone={diarizationStatusTone}>{diarizationStatusLabel}</StatusBadge>
        </div>

        <p className="mt-3 text-sm leading-6 text-zinc-600">
          {diarizationReady
            ? "The app runs pyannote.audio locally against the file path below after the meeting ends. Add a speaker count if you want to lock the diarization pass to a specific number of speakers."
            : snapshot.diarizationSettings?.status ?? "Speaker diarization is not ready yet."}
        </p>

        <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Audio file path
            </span>
            <input
              value={meeting.audioPath}
              onChange={(event) => {
                appStore.updateMeetingAudioPath(meeting.id, event.target.value);
              }}
              placeholder="~/Recordings/meeting.wav"
              className="mt-2 min-h-11 w-full rounded-xl border border-zinc-900/10 bg-white/70 px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
            />
          </label>

          <label className="block">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Speaker count
            </span>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={meeting.requestedSpeakerCount ?? ""}
              onChange={(event) => {
                appStore.updateMeetingRequestedSpeakerCount(meeting.id, event.target.value);
              }}
              placeholder="Auto"
              className="mt-2 min-h-11 w-full rounded-xl border border-zinc-900/10 bg-white/70 px-4 text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
            />
          </label>
        </div>

        <div className="mt-4">
          <SecondaryButton
            disabled={snapshot.diarizationRunBusy}
            onClick={() => {
              void appStore.runMeetingDiarization(meeting.id);
            }}
          >
            {snapshot.diarizationRunBusy ? "Running..." : "Run diarization"}
          </SecondaryButton>
        </div>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {meeting.diarizationRanAt
            ? `${meeting.diarizationSpeakerCount} speakers across ${meeting.diarizationSegments.length} segments · ${formatDateTime(meeting.diarizationRanAt)}`
            : diarizationEnabled
              ? "Add an audio file path and the app will run diarization automatically after the meeting ends."
              : "Speaker diarization is not available in this build yet."}
        </p>

        {meeting.diarizationPipelineSource ? (
          <div className="mt-4 rounded-2xl border border-zinc-900/8 bg-white/55 px-4 py-3">
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
            <div className="rounded-2xl border border-dashed border-zinc-900/10 bg-white/35 px-6 py-8 text-center">
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
                  className="rounded-2xl border border-zinc-900/8 bg-white/35 px-4 py-3"
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
      </Surface>

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
      <section className="mx-auto flex h-[calc(100vh-2.5rem)] max-w-[760px] items-center">
        <Surface className="w-full p-8">
          <p className="text-sm text-zinc-600">Loading preferences...</p>
        </Surface>
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
        "mx-auto flex h-[calc(100vh-2.5rem)] flex-col gap-6 overflow-y-auto",
        isSettingsWindow ? "max-w-[640px]" : "max-w-[760px]",
      )}
    >
      <Surface className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-zinc-950">Transcription model</p>
            <p className="mt-1 text-sm leading-6 text-zinc-600">
              Download Qwen3-ASR once and keep it local to this Mac for offline transcription.
            </p>
          </div>
          <StatusBadge tone={modelStatusTone}>{modelStatusLabel}</StatusBadge>
        </div>

        <p className="mt-4 text-sm leading-6 text-zinc-600">
          {modelReady
            ? snapshot.modelSettings?.huggingFaceStatus ?? "Local transcription model is ready."
            : setupBanner?.copy ?? "Download the local transcription model to continue."}
        </p>

        {setupBanner?.detail ? (
          <p className="mt-3 text-sm text-zinc-500">{setupBanner.detail}</p>
        ) : null}

        {(snapshot.modelDownload?.localPath || snapshot.modelSettings?.huggingFaceLocalPath) ? (
          <div className="mt-4 rounded-2xl border border-zinc-900/8 bg-white/55 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
              Storage
            </p>
            <code className="mt-1 block break-all text-xs text-zinc-700">
              {snapshot.modelDownload?.localPath || snapshot.modelSettings?.huggingFaceLocalPath}
            </code>
          </div>
        ) : null}

        {!modelReady ? (
          <div className="mt-5">
            <PrimaryButton
              disabled={snapshot.modelBusy || downloadStatus === "downloading"}
              onClick={() => {
                void appStore.startManagedModelDownload();
              }}
            >
              {snapshot.modelBusy || downloadStatus === "downloading"
                ? "Starting download..."
                : "Download model"}
            </PrimaryButton>
          </div>
        ) : null}
      </Surface>

      <div className="grid gap-6">
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
