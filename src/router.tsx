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
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Check,
  ChevronDown,
  ChevronLeft,
  CircleAlert,
  Cloud,
  Globe2,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
  Users,
} from "lucide-react";
import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import anthropicLogo from "./assets/provider-icons/anthropic.png";
import brandWordmark from "./assets/brand-wordmark.svg";
import charLogo from "./assets/char-logo.svg";
import googleLogo from "./assets/provider-icons/google.png";
import lmStudioLogo from "./assets/provider-icons/lmstudio.png";
import metaLogo from "./assets/provider-icons/meta.png";
import nvidiaLogo from "./assets/provider-icons/nvidia.png";
import ollamaLogo from "./assets/provider-icons/ollama.png";
import openAILogo from "./assets/provider-icons/openai.png";
import openRouterLogo from "./assets/provider-icons/openrouter.png";
import qwenLogo from "./assets/provider-icons/qwen.png";
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
  Field,
  FieldDescription,
  FieldLabel,
  Input,
  Kbd,
  Progress,
  ProgressIndicator,
  ProgressLabel,
  ProgressTrack,
  ProgressValue,
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  ScrollFade,
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
  cn,
} from "./components/ui";
import { useScrollFade } from "./hooks/useScrollFade";
import {
  LANGUAGE_OPTIONS,
  appStore,
  currentSetupBannerContent,
  formatDateTime,
  getMeetingTranscriptEntries,
  getMeetingSpeakerLabel,
  getMeetingSpeakerSuggestion,
  getTimezoneOptions,
  isSettingsWindow,
  meetingHasSpeakerOverride,
  requiresAppSetup,
  sortedMeetings,
  type AudioRetentionPolicy,
  type ManagedModelDownloadState,
  type Meeting,
  type SpeakerProfile,
  type SpeakerProfileSample,
  type SpeakerSuggestion,
  type SpeechModelId,
  type TranscriptEntry,
  useAppState,
} from "./store";
import {
  type MenuItemDef,
  showNativeMenu,
  showNativeContextMenu,
} from "./hooks/useNativeContextMenu";
import {
  SUMMARY_PROVIDERS,
  getSummaryProviderDefinition,
  type SummaryProviderId,
} from "./lib/summary-providers";
import { Spinner } from "./components/ui/spinner";

function IconBack() {
  return <ChevronLeft className="size-5" strokeWidth={1.5} aria-hidden="true" />;
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

function IconMoreHorizontal() {
  return (
    <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="3" cy="8" r="1.25" fill="currentColor" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" />
      <circle cx="13" cy="8" r="1.25" fill="currentColor" />
    </svg>
  );
}

function IconStopSquare({ className }: { className?: string }) {
  return (
    <svg className={cn("size-3.5", className)} viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="9" height="9" rx="2" fill="currentColor" />
    </svg>
  );
}

function BrandWordmark({ className }: { className?: string }) {
  return (
    <img
      src={brandWordmark}
      alt="unsigned Char"
      className={cn("block h-8 w-auto -translate-y-1", className)}
      draggable={false}
    />
  );
}

const AI_SUMMARIES_SETTINGS_SECTION = "ai-summaries";
const AI_SUMMARIES_SETTINGS_SECTION_ID = "settings-ai-summaries";
const TRANSCRIPTION_MODEL_SETTINGS_SECTION = "transcription-model";
const TRANSCRIPTION_MODEL_SETTINGS_SECTION_ID = "settings-transcription-model";
const MASKED_TEXT_INPUT_STYLE = {
  WebkitTextSecurity: "disc",
} as CSSProperties;

const SETTINGS_SECTION_IDS = {
  [AI_SUMMARIES_SETTINGS_SECTION]: AI_SUMMARIES_SETTINGS_SECTION_ID,
  [TRANSCRIPTION_MODEL_SETTINGS_SECTION]: TRANSCRIPTION_MODEL_SETTINGS_SECTION_ID,
} as const;

type SettingsSection = keyof typeof SETTINGS_SECTION_IDS;

function readTargetSettingsSection() {
  const queryIndex = window.location.hash.indexOf("?");

  if (queryIndex < 0) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.slice(queryIndex + 1));
  const section = params.get("section");

  return section && section in SETTINGS_SECTION_IDS ? (section as SettingsSection) : null;
}

function scrollSettingsSectionIntoView(section: SettingsSection | null) {
  if (!section) {
    return;
  }

  document.getElementById(SETTINGS_SECTION_IDS[section])?.scrollIntoView({ behavior: "smooth", block: "start" });
}

let activeSpeakerSampleId: string | null = null;
let activeSpeakerAudio: HTMLAudioElement | null = null;
let activeSpeakerAudioTimer: number | null = null;
const speakerSampleListeners = new Set<() => void>();

function emitSpeakerSampleChange() {
  speakerSampleListeners.forEach((listener) => listener());
}

function stopSpeakerSamplePreview() {
  if (activeSpeakerAudioTimer !== null) {
    window.clearTimeout(activeSpeakerAudioTimer);
    activeSpeakerAudioTimer = null;
  }

  if (activeSpeakerAudio) {
    activeSpeakerAudio.pause();
    activeSpeakerAudio.currentTime = 0;
    activeSpeakerAudio = null;
  }

  if (activeSpeakerSampleId !== null) {
    activeSpeakerSampleId = null;
    emitSpeakerSampleChange();
  }
}

async function playSpeakerSamplePreview(sample: SpeakerProfileSample) {
  stopSpeakerSamplePreview();

  const audio = new Audio(convertFileSrc(sample.audioPath));
  activeSpeakerAudio = audio;
  activeSpeakerSampleId = sample.id;
  emitSpeakerSampleChange();
  audio.addEventListener(
    "ended",
    () => {
      stopSpeakerSamplePreview();
    },
    { once: true },
  );

  await new Promise<void>((resolve, reject) => {
    const handleLoaded = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to load sample audio."));
    };
    const cleanup = () => {
      audio.removeEventListener("loadedmetadata", handleLoaded);
      audio.removeEventListener("error", handleError);
    };

    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      resolve();
      return;
    }

    audio.addEventListener("loadedmetadata", handleLoaded, { once: true });
    audio.addEventListener("error", handleError, { once: true });
    audio.load();
  });

  audio.currentTime = Math.max(0, sample.startSeconds);

  const durationMs = Math.max(300, (sample.endSeconds - sample.startSeconds) * 1000);
  activeSpeakerAudioTimer = window.setTimeout(() => {
    stopSpeakerSamplePreview();
  }, durationMs + 150);

  await audio.play();
}

function subscribeSpeakerSample(listener: () => void) {
  speakerSampleListeners.add(listener);
  return () => speakerSampleListeners.delete(listener);
}

function useActiveSpeakerSampleId() {
  return useSyncExternalStore(
    subscribeSpeakerSample,
    () => activeSpeakerSampleId,
    () => activeSpeakerSampleId,
  );
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

function BottomBannerShell({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50">
      <div className="mx-auto w-full max-w-[780px]">
        <div className="pointer-events-auto rounded-[calc(var(--radius)+2px)] border border-zinc-950 bg-zinc-950 px-4 py-4 text-white shadow-[0_1px_2px_rgba(15,23,42,0.08),0_20px_44px_rgba(15,23,42,0.18)]">
          {children}
        </div>
      </div>
    </div>
  );
}

function DiarizationActivityBanner({
  message,
  minimized,
  phase,
  onClose,
  onExpand,
  onMinimize,
}: {
  message: string | null;
  minimized: boolean;
  phase: "running" | "done";
  onClose: () => void;
  onExpand: () => void;
  onMinimize: () => void;
}) {
  if (phase === "running" && minimized) {
    return (
      <Button
        size="icon-xl"
        aria-label="Show speaker identification progress"
        className="fixed right-6 bottom-6 z-50 rounded-full border-zinc-950 bg-zinc-950 text-white shadow-[0_18px_48px_rgba(15,23,42,0.36)] before:shadow-none hover:bg-zinc-900 data-pressed:bg-zinc-900 *:data-[slot=button-loading-indicator]:text-white"
        onClick={onExpand}
      >
        <Spinner className="size-5 text-white" />
      </Button>
    );
  }

  const completion = phase === "done";
  const bannerCopy = completion
    ? message ?? "Speaker identification finished."
    : "Speaker identification in progress.";

  return (
    <BottomBannerShell>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {!completion ? <Spinner className="size-4 shrink-0 text-white/80" /> : null}
          <p className="min-w-0 text-sm font-medium leading-5 text-white">{bannerCopy}</p>
        </div>
        <div data-window-drag="false">
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-white/45 shadow-none hover:bg-transparent hover:text-white/70 data-pressed:bg-transparent data-pressed:text-white/70"
            aria-label={
              completion
                ? "Dismiss speaker identification notice"
                : "Minimize speaker identification progress"
            }
            onClick={completion ? onClose : onMinimize}
          >
            {completion ? <IconClose /> : <ChevronDown className="size-4" strokeWidth={1.8} />}
          </Button>
        </div>
      </div>
    </BottomBannerShell>
  );
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
      speakerId: segment.speaker,
      speakerLabel: getMeetingSpeakerLabel(meeting, segment.speaker),
    };
  }

  return {
    speakerId: null,
    speakerLabel: formatTranscriptSourceLabel(entry.source),
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

function SettingsStatusDot({
  active,
  label,
}: {
  active: boolean;
  label: string;
}) {
  return (
    <span
      className="relative inline-flex size-3 shrink-0 items-center justify-center"
      aria-label={label}
      title={label}
    >
      {active ? (
        <span
          aria-hidden="true"
          className="absolute inline-flex size-3 animate-ping rounded-full bg-sky-400/45 motion-reduce:animate-none"
        />
      ) : null}
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex size-2 rounded-full",
          active
            ? "bg-sky-500 shadow-[0_0_0_4px_rgba(14,165,233,0.12)]"
            : "bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]",
        )}
      />
    </span>
  );
}

function getModelDownloadProgressPercent(download: ManagedModelDownloadState | null) {
  if (download?.progressPercent === null || download?.progressPercent === undefined) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(download.progressPercent)));
}

function ModelDownloadGauge({
  busy,
  download,
}: {
  busy: boolean;
  download: ManagedModelDownloadState | null;
}) {
  const progressPercent = getModelDownloadProgressPercent(download);
  const progressLabel = progressPercent === null ? "Starting" : `${progressPercent}%`;

  return (
    <div className="w-full rounded-[calc(var(--radius)-6px)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-3 py-3">
      <Progress
        aria-label="Model download progress"
        getAriaValueText={(_formatted, value) =>
          value === null ? "Preparing download" : `${Math.round(value)}% downloaded`
        }
        value={progressPercent}
      >
        <div className="flex items-center justify-between gap-3">
          <ProgressLabel className="min-w-0 truncate">
            {download?.currentFile ?? (busy ? "Starting download..." : "Preparing download...")}
          </ProgressLabel>
          <ProgressValue className="shrink-0">
            {(formattedValue, value) =>
              value === null ? progressLabel : (formattedValue ?? `${Math.round(value)}%`)
            }
          </ProgressValue>
        </div>
        <ProgressTrack>
          <ProgressIndicator />
        </ProgressTrack>
      </Progress>
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

type AppSnapshot = ReturnType<typeof useAppState>;

function getMeetingPostProcessingLabel(meeting: Meeting, snapshot: AppSnapshot) {
  if (snapshot.transcriptionStopping && snapshot.recordingMeetingId === meeting.id) {
    return "Finishing transcript";
  }

  if (snapshot.diarizationRunBusy && snapshot.diarizationMeetingId === meeting.id) {
    return "Post-processing speakers";
  }

  if (snapshot.summaryMeetingId === meeting.id) {
    return "Generating summary";
  }

  return null;
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
        className="w-full max-w-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm(meeting.id);
          }}
        >
          <div className="flex items-center justify-between gap-4 px-5 py-4">
            <CardTitle id="delete-meeting-title" className="text-base">
              Delete this?
            </CardTitle>
            <Button
              variant="destructive"
              type="submit"
              autoFocus
              className="shrink-0 gap-2 text-white"
              style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
            >
              <span>Yes</span>
              <Kbd
                className="border-white/20 bg-white/14 text-white shadow-none"
                style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
              >
                ⏎
              </Kbd>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function DeleteSummaryApiKeyDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) {
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
        aria-labelledby="delete-summary-api-key-title"
        className="w-full max-w-sm"
        onClick={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onConfirm();
          }}
        >
          <div className="space-y-4 px-5 py-4">
            <div className="space-y-1">
              <CardTitle id="delete-summary-api-key-title" className="text-base">
                Delete saved API key?
              </CardTitle>
              <CardDescription>Are you sure you want to delete the API key?</CardDescription>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                type="submit"
                autoFocus
                className="text-white"
                style={{ color: "#fff", WebkitTextFillColor: "#fff" }}
              >
                Delete
              </Button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}

const insetPanelClass =
  "rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-[color:var(--secondary)] px-4 py-3";
const windowShellHeightClass = "h-full min-h-0";
const appWindow = getCurrentWindow();
const isMainWindow = appWindow.label === "main";

function MainWindowCharBanner() {
  const snapshot = useAppState();
  const [dismissed, setDismissed] = useState(false);
  const diarizationActive =
    snapshot.diarizationMeetingId !== null &&
    (snapshot.diarizationRunBusy || Boolean(snapshot.diarizationBannerMessage));

  if (dismissed || diarizationActive) {
    return null;
  }

  return (
    <BottomBannerShell>
      <div className="min-w-0">
        <span className="min-w-0">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">
            Try out Char
          </span>
          <span className="mt-1 block text-sm font-medium leading-5 text-white">
            If you want better transcription, start using Char.
          </span>
        </span>
        <div className="mt-4 flex items-center gap-2" data-window-drag="false">
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center gap-2 rounded-[var(--radius-control)] border border-white bg-white px-3 text-sm font-medium shadow-none transition-colors hover:bg-zinc-100 active:bg-zinc-100 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-zinc-950"
            style={{ color: "#18181b", WebkitTextFillColor: "#18181b" }}
            onClick={() => {
              void invoke("open_char_website").catch((error) => {
                console.error("Failed to open Char website", error);
              });
            }}
          >
            Start using
            <img src={charLogo} alt="" aria-hidden="true" className="h-3.5 w-auto shrink-0" />
          </button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="px-1 text-white/45 shadow-none hover:bg-transparent hover:text-white/70 data-pressed:bg-transparent data-pressed:text-white/70"
            onClick={() => {
              setDismissed(true);
            }}
          >
            Dismiss
          </Button>
        </div>
      </div>
    </BottomBannerShell>
  );
}

type SearchableOption = {
  value: string;
  label: string;
  detail?: string;
  icon?: "omnilingual" | "cloud" | "local" | "custom" | "disabled";
  logoSrc?: string;
  logoClassName?: string;
  badges?: readonly {
    label: string;
    icon?: "close";
    variant:
      | "default"
      | "error"
      | "secondary"
      | "outline"
      | "success"
      | "warning"
      | "destructive"
      | "info";
  }[];
  searchTerms?: readonly string[];
};

function SearchableOptionPrefix({
  icon,
  logoSrc,
  logoClassName,
}: {
  icon?: SearchableOption["icon"];
  logoSrc?: string;
  logoClassName?: string;
}) {
  if (logoSrc) {
    return (
      <img
        src={logoSrc}
        alt=""
        aria-hidden="true"
        className={cn("size-7 shrink-0 object-contain", logoClassName)}
      />
    );
  }

  if (!icon) {
    return null;
  }

  const iconClassName = "size-5";

  const content = {
    cloud: <Cloud className={iconClassName} strokeWidth={1.8} aria-hidden="true" />,
    custom: <PlugZap className={iconClassName} strokeWidth={1.8} aria-hidden="true" />,
    disabled: <PlugZap className={iconClassName} strokeWidth={1.8} aria-hidden="true" />,
    local: <Save className={iconClassName} strokeWidth={1.8} aria-hidden="true" />,
    omnilingual: <Globe2 className={iconClassName} strokeWidth={1.8} aria-hidden="true" />,
  } satisfies Record<NonNullable<SearchableOption["icon"]>, ReactNode>;

  const toneClassName = {
    cloud: "text-sky-700",
    custom: "text-zinc-700",
    disabled: "text-zinc-500",
    local: "text-emerald-700",
    omnilingual: "text-amber-700",
  } satisfies Record<NonNullable<SearchableOption["icon"]>, string>;

  return (
    <span className={cn("inline-flex size-7 shrink-0 items-center justify-center", toneClassName[icon])}>
      {content[icon]}
    </span>
  );
}

function SelectOptionContent({ option }: { option: SearchableOption }) {
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 overflow-hidden">
      <SearchableOptionPrefix
        icon={option.icon}
        logoSrc={option.logoSrc}
        logoClassName={option.logoClassName}
      />
      <span className="min-w-0 flex-1 truncate">{option.label}</span>
      {option.badges?.length ? (
        <span className="inline-flex shrink-0 items-center gap-1">
          {option.badges.map((badge) => (
            <Badge key={`${option.value}-${badge.label}`} variant={badge.variant} size="sm">
              <span>{badge.label}</span>
              {badge.icon === "close" ? <IconClose /> : null}
            </Badge>
          ))}
        </span>
      ) : null}
      {option.detail ? (
        <span className="shrink-0 text-[11px] uppercase tracking-[0.08em] text-zinc-500">
          {option.detail}
        </span>
      ) : null}
    </span>
  );
}

const summaryProviderLogos: Partial<Record<SummaryProviderId, string>> = {
  anthropic: anthropicLogo,
  google_generative_ai: googleLogo,
  lmstudio: lmStudioLogo,
  ollama: ollamaLogo,
  openai: openAILogo,
  openrouter: openRouterLogo,
};

const summaryProviderLogoClassNames: Partial<Record<SummaryProviderId, string>> = {
  lmstudio: "size-6",
  ollama: "size-6",
  openrouter: "size-6",
};

const speechModelLogos: Partial<Record<SpeechModelId, string>> = {
  omnilingual: metaLogo,
  parakeetStreaming: nvidiaLogo,
  parakeetBatch: nvidiaLogo,
  qwen3Large: qwenLogo,
  qwen3Small: qwenLogo,
};

const speechModelLogoClassNames: Partial<Record<SpeechModelId, string>> = {
  omnilingual: "size-6",
  parakeetStreaming: "size-6",
  parakeetBatch: "size-6",
  qwen3Large: "size-6",
  qwen3Small: "size-6",
};

const summaryProviderOptions: readonly SearchableOption[] = [
  ...SUMMARY_PROVIDERS.map((provider): SearchableOption => ({
    value: provider.id,
    label: provider.label,
    detail: provider.detail,
    icon: provider.id === "custom" ? "custom" : undefined,
    logoSrc: summaryProviderLogos[provider.id],
    logoClassName: summaryProviderLogoClassNames[provider.id],
  })),
];

const audioRetentionOptions: readonly SearchableOption[] = [
  {
    value: "none",
    label: "Don't save",
    detail: "Off",
    icon: "disabled",
    badges: [
      {
        label: "Diarization",
        icon: "close",
        variant: "error",
      },
      {
        label: "Denoise",
        icon: "close",
        variant: "error",
      },
    ],
    searchTerms: ["disable diarization", "do not save", "no audio"],
  },
  {
    value: "oneDay",
    label: "For 1 day",
    detail: "1 day",
    icon: "local",
  },
  {
    value: "threeDays",
    label: "For 3 days",
    detail: "3 days",
    icon: "local",
  },
  {
    value: "oneWeek",
    label: "For 1 week",
    detail: "1 week",
    icon: "local",
  },
  {
    value: "oneMonth",
    label: "For 1 month",
    detail: "1 month",
    icon: "local",
  },
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

function SettingsSelect({
  ariaLabel,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  className,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SearchableOption[];
  placeholder: string;
  disabled?: boolean;
  className?: string;
}) {
  const selectedOption = options.find((option) => option.value === value);

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") {
          onChange(nextValue);
        }
      }}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        size="lg"
        className={cn("min-w-0", className)}
      >
        {selectedOption ? (
          <SelectOptionContent option={selectedOption} />
        ) : (
          <span className="text-zinc-500">{placeholder}</span>
        )}
      </SelectTrigger>

      <SelectPopup>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} label={option.label}>
            <SelectOptionContent option={option} />
          </SelectItem>
        ))}
      </SelectPopup>
    </Select>
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
      className="relative w-full min-w-0"
      onBlurCapture={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
          return;
        }

        close();
      }}
    >
      <div
        className={cn(
          "flex min-h-12 w-full min-w-0 flex-wrap items-center gap-2 rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--card)] px-3 py-2 shadow-[0_1px_0_rgba(255,255,255,0.85)]",
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
          className="min-w-0 flex-1 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500"
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
        "relative isolate flex h-full min-h-0 w-full flex-col text-zinc-900",
        isSettingsWindow && "bg-[linear-gradient(180deg,#fcfcfa_0%,var(--background)_48%,#f2f4f8_100%)]",
      )}
    >
      {isSettingsWindow ? (
        <WindowDragRegion className="absolute inset-x-0 top-0 z-20 h-10 w-full" />
      ) : (
        <WindowDragRegion className="h-10 w-full shrink-0" />
      )}
      <div className={cn("min-h-0 flex-1", isSettingsWindow ? "px-0" : "px-4")}>
        <Outlet />
      </div>
      {isMainWindow ? <MainWindowCharBanner /> : null}
    </div>
  );
}

function HomeScreen() {
  const snapshot = useAppState();
  const navigate = useNavigate();
  const [meetingPendingDelete, setMeetingPendingDelete] = useState<DeleteMeetingRequest | null>(null);
  const meetings = useMemo(() => {
    const nextMeetings = sortedMeetings(snapshot.meetings);
    const activeMeetingId = snapshot.recordingMeetingId;

    if (!activeMeetingId) {
      return nextMeetings;
    }

    const activeMeetingIndex = nextMeetings.findIndex((meeting) => meeting.id === activeMeetingId);

    if (activeMeetingIndex <= 0) {
      return nextMeetings;
    }

    const [activeMeeting] = nextMeetings.splice(activeMeetingIndex, 1);
    nextMeetings.unshift(activeMeeting);
    return nextMeetings;
  }, [snapshot.meetings, snapshot.recordingMeetingId]);
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
      <WindowDragRegion className="shrink-0 flex items-center justify-between gap-4">
        <BrandWordmark className="shrink-0" />
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
                </CardPanel>
                {showModelDownloadGauge ? (
                  <CardFooter className="border-t-0 pt-0">
                    <ModelDownloadGauge busy={snapshot.modelBusy} download={snapshot.modelDownload} />
                  </CardFooter>
                ) : setupBanner.actionLabel || setupBanner.secondaryActionLabel ? (
                  <CardFooter className="border-t-0 pt-0">
                    <div className="flex flex-wrap gap-2">
                      {setupBanner.actionLabel ? (
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
                      ) : null}
                      {setupBanner.secondaryActionLabel ? (
                        <Button
                          variant="secondary"
                          onClick={() => {
                            void appStore.openSettingsWindow(TRANSCRIPTION_MODEL_SETTINGS_SECTION);
                          }}
                        >
                          {setupBanner.secondaryActionLabel}
                        </Button>
                      ) : null}
                    </div>
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
                  const isCurrentMeeting = snapshot.recordingMeetingId === meeting.id;
                  const postProcessingLabel = getMeetingPostProcessingLabel(meeting, snapshot);
                  const deleteDisabled = isMeetingDeleteDisabled(
                    meeting,
                    snapshot.transcriptionBusy,
                    snapshot.transcriptionRunning,
                    snapshot.recordingMeetingId,
                  );

                  return (
                    <div key={meeting.id} className="relative">
                      <Card
                        className={cn(
                          "transition hover:-translate-y-px hover:shadow-[0_1px_2px_rgba(15,23,42,0.08),0_22px_46px_rgba(15,23,42,0.1)]",
                          isCurrentMeeting &&
                            "border-rose-400/90 bg-[linear-gradient(180deg,rgba(255,247,248,0.98)_0%,rgba(255,255,255,1)_100%)] shadow-[0_0_0_1px_rgba(251,113,133,0.6),0_0_0_7px_rgba(244,63,94,0.12),0_20px_42px_rgba(244,63,94,0.2)] hover:shadow-[0_0_0_1px_rgba(251,113,133,0.72),0_0_0_10px_rgba(244,63,94,0.16),0_24px_52px_rgba(244,63,94,0.24)]",
                        )}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          className="absolute inset-0 z-10 h-auto w-full rounded-[calc(var(--radius)+2px)] border-transparent bg-transparent p-0 text-left shadow-none hover:bg-transparent data-pressed:bg-transparent"
                          aria-label={`Open ${meeting.title}${isCurrentMeeting ? ", currently in progress" : ""}`}
                          onClick={() => {
                            navigate({
                              to: "/meeting/$meetingId",
                              params: { meetingId: meeting.id },
                            });
                          }}
                          onContextMenu={(event) => {
                            void showNativeContextMenu(
                              getMeetingActionMenuItems(
                                meeting,
                                deleteDisabled,
                                setMeetingPendingDelete,
                              ),
                              event,
                            );
                          }}
                        />
                        <CardPanel className="p-4">
                          <div className="flex min-w-0 items-center justify-between gap-4">
                            <div className="flex min-w-0 flex-1 flex-col">
                              <h2 className="truncate text-lg font-semibold tracking-[-0.03em] text-zinc-950">
                                {meeting.title}
                              </h2>
                              <p className="mt-1 truncate text-sm text-zinc-500">
                                Created {formatDateTime(meeting.createdAt)}
                              </p>
                            </div>

                            {postProcessingLabel ? (
                              <span className="inline-flex shrink-0 text-zinc-500" title={postProcessingLabel}>
                                <Spinner aria-label={postProcessingLabel} className="size-4" />
                              </span>
                            ) : null}
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
      className="min-h-14 w-full border-0 bg-transparent p-0 text-[56px] leading-none font-semibold tracking-[-0.045em] text-zinc-950 outline-none"
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

function MeetingHeaderTimestampButton({
  meeting,
}: {
  meeting: Pick<Meeting, "createdAt" | "updatedAt">;
}) {
  return (
    <div
      className="group relative inline-flex h-10 min-w-[220px] items-center justify-center px-2.5 text-zinc-600"
      data-window-drag="false"
      aria-label={`Created ${formatDateTime(meeting.createdAt)}. Hover to show updated ${formatDateTime(meeting.updatedAt)}.`}
      title={`Updated ${formatDateTime(meeting.updatedAt)}`}
    >
      <span className="text-[15px] font-medium tracking-[-0.01em] text-zinc-700 transition-opacity duration-150 group-hover:opacity-0">
        {formatDateTime(meeting.createdAt)}
      </span>
      <span className="pointer-events-none absolute inset-x-2.5 top-1/2 -translate-y-1/2 text-center text-[15px] font-medium tracking-[-0.01em] text-zinc-700 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        {formatDateTime(meeting.updatedAt)}
      </span>
      <span className="pointer-events-none absolute left-1/2 top-full mt-0.5 -translate-x-1/2 text-[10px] font-medium tracking-[0.02em] text-zinc-400 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        updated
      </span>
    </div>
  );
}

function MeetingHeaderMoreButton({
  meeting,
  deleteDisabled,
  onDeleteRequested,
}: {
  meeting: Meeting;
  deleteDisabled: boolean;
  onDeleteRequested: (meeting: DeleteMeetingRequest) => void;
}) {
  return (
    <div data-window-drag="false">
      <Button
        variant="ghost"
        size="icon-sm"
        className="shrink-0"
        aria-label="More actions"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          void showNativeMenu(
            getMeetingActionMenuItems(meeting, deleteDisabled, onDeleteRequested),
            {
              at: {
                x: rect.left,
                y: rect.bottom + 6,
              },
            },
          );
        }}
      >
        <IconMoreHorizontal />
      </Button>
    </div>
  );
}

function SpeakerLabelField({
  meetingId,
  speakerId,
  speakerLabel,
  suggestion,
  showSuggestion,
}: {
  meetingId: string;
  speakerId: string;
  speakerLabel: string;
  suggestion: SpeakerSuggestion | null;
  showSuggestion: boolean;
}) {
  const [draft, setDraft] = useState(speakerLabel);
  const [isEditing, setIsEditing] = useState(false);
  const draftWidth: CSSProperties = {
    width: `${Math.max(draft.length, speakerLabel.length, 6) + 1}ch`,
  };

  const save = () => {
    appStore.updateMeetingSpeakerLabel(meetingId, speakerId, draft);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        value={draft}
        autoFocus
        spellCheck={false}
        aria-label="Speaker label"
        title="Rename this speaker across the transcript"
        className="-ml-1.5 h-7 min-w-0 appearance-none rounded-[var(--radius-control-sm)] border-0 bg-transparent px-1.5 py-1 text-[11px] font-semibold normal-case tracking-[0.08em] text-zinc-700 outline-none"
        style={draftWidth}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            save();
            return;
          }

          if (event.key === "Escape") {
            event.preventDefault();
            setDraft(speakerLabel);
            setIsEditing(false);
          }
        }}
      />
    );
  }

  return (
    <div className="flex min-w-0 flex-col items-start gap-1">
      <button
        type="button"
        className="-ml-1.5 inline-flex h-7 min-w-0 items-center rounded-[var(--radius-control-sm)] bg-transparent px-1.5 py-1 text-left text-[11px] font-semibold text-zinc-700 normal-case tracking-[0.08em] transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
        aria-label={`Rename speaker ${speakerLabel}`}
        title="Rename this speaker across the transcript"
        style={draftWidth}
        onClick={() => {
          setDraft(speakerLabel);
          setIsEditing(true);
        }}
      >
        {speakerLabel}
      </button>
      {showSuggestion && suggestion ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" size="sm">
            Likely {suggestion.profileName}
          </Badge>
          <button
            type="button"
            className="text-[11px] font-semibold tracking-[0.08em] text-zinc-600 transition hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            onClick={() => {
              appStore.updateMeetingSpeakerLabel(meetingId, speakerId, suggestion.profileName);
            }}
          >
            Use match
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MeetingScreen() {
  const snapshot = useAppState();
  const navigate = useNavigate();
  const [meetingPendingDelete, setMeetingPendingDelete] = useState<DeleteMeetingRequest | null>(null);
  const { meetingId } = useParams({ from: "/meeting/$meetingId" });
  const transcriptScrollFade = useScrollFade<HTMLElement>({
    stickToBottom:
      snapshot.recordingMeetingId === meetingId &&
      snapshot.transcriptionRunning &&
      !snapshot.transcriptionStopping,
  });
  const {
    attachRef: attachTranscriptScrollFade,
    handleScroll: handleTranscriptScroll,
    scrollToBottom: scrollTranscriptToBottom,
  } = transcriptScrollFade;
  const meeting = snapshot.meetings.find((candidate) => candidate.id === meetingId) ?? null;
  const attachTranscriptRef = useCallback(
    (node: HTMLElement | null) => {
      attachTranscriptScrollFade(node);

      if (!node) {
        return;
      }

      window.requestAnimationFrame(() => {
        scrollTranscriptToBottom(node);
      });
    },
    [attachTranscriptScrollFade, scrollTranscriptToBottom],
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
  const firstSpeakerSegmentIndex = meeting.diarizationSegments.reduce<Record<string, number>>(
    (indices, segment, index) => {
      if (indices[segment.speaker] === undefined) {
        indices[segment.speaker] = index;
      }
      return indices;
    },
    {},
  );
  const deleteDisabled = isMeetingDeleteDisabled(
    meeting,
    snapshot.transcriptionBusy,
    snapshot.transcriptionRunning,
    snapshot.recordingMeetingId,
  );
  const isStartingMeeting =
    meeting.status === "live" &&
    snapshot.startMeetingBusy &&
    snapshot.recordingMeetingId === meeting.id &&
    !snapshot.transcriptionRunning;
  const isStoppingMeeting =
    snapshot.transcriptionStopping && snapshot.recordingMeetingId === meeting.id;
  const isMeetingListening =
    !isStoppingMeeting &&
    (snapshot.recordingMeetingId === meeting.id ||
      (meeting.status === "live" && snapshot.transcriptionRunning));
  const showDiarizationActivity =
    snapshot.diarizationMeetingId === meeting.id &&
    (snapshot.diarizationRunBusy || Boolean(snapshot.diarizationBannerMessage));
  const diarizationBannerPhase =
    snapshot.diarizationRunBusy && snapshot.diarizationMeetingId === meeting.id ? "running" : "done";
  const diarizationIndicatorMinimized =
    showDiarizationActivity && diarizationBannerPhase === "running" && snapshot.diarizationIndicatorMinimized;
  const summaryReady = Boolean(snapshot.summarySettings?.ready);
  const showSummaryCard = !isMeetingListening && Boolean(meeting.summary);
  const isGeneratingSummary = snapshot.summaryMeetingId === meeting.id;
  const summaryTooltipTitle = isGeneratingSummary
    ? "Generating summary"
    : isStoppingMeeting
      ? "Finishing transcript"
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
    : isStoppingMeeting
      ? "Wait for the transcript to finish processing."
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
    snapshot.transcriptionBusy ||
    !summaryReady ||
    isMeetingListening ||
    transcriptEntries.length === 0;
  const showTranscriptEmptyState = transcriptEntries.length === 0;
  const emptyTranscriptCopy =
    isStartingMeeting
      ? "Transcription is starting."
      : isStoppingMeeting
      ? "Finishing transcript."
      : meeting.status === "live" && snapshot.modelSettings?.processingMode === "batch"
      ? "Transcript will be generated after you stop the meeting."
      : "Transcript will appear here.";
  const summaryMeta = [meeting.summaryProviderLabel, meeting.summaryModel]
    .filter((value): value is string => Boolean(value))
    .join(" · ");

  return (
    <section className={cn("mx-auto flex max-w-[760px] flex-col gap-5", windowShellHeightClass)}>
      <WindowDragRegion className="shrink-0 flex flex-col gap-5">
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

          <div className="flex min-w-0 justify-center">
            <MeetingHeaderTimestampButton key={meeting.id} meeting={meeting} />
          </div>

          <MeetingHeaderMoreButton
            meeting={meeting}
            deleteDisabled={deleteDisabled}
            onDeleteRequested={setMeetingPendingDelete}
          />
        </div>

        <div className="flex items-center gap-3">
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

      <div className="shrink-0 grid min-w-0 grid-cols-2 gap-3">
        <Button
          size="lg"
          variant={isStoppingMeeting ? "outline" : meeting.status === "live" ? "destructive" : "outline"}
          className={cn(
            "w-full min-w-0 justify-self-stretch",
            meeting.status === "live" && !isStoppingMeeting && "text-white *:data-[slot=button-loading-indicator]:text-white",
          )}
          disabled={snapshot.transcriptionBusy}
          loading={isStoppingMeeting}
          onClick={() => {
            void appStore.toggleMeetingStatus(meeting.id);
          }}
        >
          {isStoppingMeeting ? (
            "Finishing transcript"
          ) : meeting.status === "live" ? (
            isStartingMeeting ? (
              "Starting listening"
            ) : (
              <>
                <IconStopSquare className="text-white" />
                <span className="text-white">Stop listening</span>
              </>
            )
          ) : (
            <>
              <LiveIndicator />
              <span>Resume listening</span>
            </>
          )}
        </Button>

        <Tooltip>
          {summaryActionDisabled ? (
            <TooltipTrigger
              render={<span className="block w-full min-w-0 justify-self-stretch" />}
              tabIndex={0}
              aria-label={summaryTooltipTitle}
            >
              <Button
                size="lg"
                variant="outline"
                className="w-full min-w-0 justify-self-stretch"
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
                  className="w-full min-w-0 justify-self-stretch"
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

      {showDiarizationActivity ? (
        <DiarizationActivityBanner
          message={snapshot.diarizationBannerMessage}
          minimized={diarizationIndicatorMinimized}
          phase={diarizationBannerPhase}
          onClose={() => {
            appStore.dismissDiarizationBanner(meeting.id);
          }}
          onMinimize={() => {
            appStore.setDiarizationIndicatorMinimized(true);
          }}
          onExpand={() => {
            appStore.setDiarizationIndicatorMinimized(false);
          }}
        />
      ) : null}

      <div className="-mx-4 min-h-0 flex-1">
        <div className="relative h-full min-h-0">
          <div
            className="h-full overflow-y-auto"
            ref={attachTranscriptRef}
            onScroll={handleTranscriptScroll}
          >
            <div
              className={cn(
                "flex min-h-full flex-col gap-4 px-4 pb-4",
                showTranscriptEmptyState && "h-full",
              )}
            >
              {showSummaryCard ? (
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
                  {summaryMeta ? (
                    <CardFooter className="justify-start">
                      <div className="text-xs leading-5 text-zinc-500">{summaryMeta}</div>
                    </CardFooter>
                  ) : null}
                </Card>
              ) : null}

              {showTranscriptEmptyState ? (
                <div className="flex min-h-0 flex-1">
                  <Card className="flex h-full min-h-[260px] flex-1 items-center justify-center border-dotted bg-[color:var(--secondary)] px-6 text-center">
                    <p className="text-sm leading-6 text-zinc-600">{emptyTranscriptCopy}</p>
                  </Card>
                </div>
              ) : (
                <section className="space-y-5 pb-2">
                  {transcriptEntries.map((entry, index) => {
                    const { speakerId, speakerLabel } = getTranscriptEntryMeta(meeting, entry, index);

                    return (
                      <article
                        key={`${meeting.id}-${index}-${entry.source}-${entry.text.slice(0, 12)}`}
                        className="space-y-2"
                      >
                        <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                          <div className="min-w-0">
                            {speakerId ? (
                              <SpeakerLabelField
                                meetingId={meeting.id}
                                speakerId={speakerId}
                                speakerLabel={speakerLabel}
                                suggestion={getMeetingSpeakerSuggestion(meeting, speakerId)}
                                showSuggestion={
                                  !meetingHasSpeakerOverride(meeting, speakerId) &&
                                  firstSpeakerSegmentIndex[speakerId] === index
                                }
                              />
                            ) : (
                              <span className="text-zinc-700 normal-case tracking-[0.08em]">
                                {speakerLabel}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className="whitespace-pre-wrap text-[15px] leading-8 text-zinc-800">
                          {entry.text}
                        </p>
                      </article>
                    );
                  })}
                </section>
              )}

              {snapshot.meetingNote ? (
                <p className="pb-2 text-sm text-rose-700">{snapshot.meetingNote}</p>
              ) : null}
            </div>
          </div>
          <ScrollFade
            tone="background"
            showTop={transcriptScrollFade.showTop}
            showBottom={transcriptScrollFade.showBottom}
          />
        </div>
      </div>
      <DeleteMeetingDialog
        meeting={meetingPendingDelete}
        onCancel={() => {
          setMeetingPendingDelete(null);
        }}
        onConfirm={(meetingId) => {
          setMeetingPendingDelete(null);
          navigate({ to: "/" });
          void appStore.deleteMeeting(meetingId);
        }}
      />
    </section>
  );
}

function SpeakerSampleButton({ sample }: { sample: SpeakerProfileSample }) {
  const activeSampleId = useActiveSpeakerSampleId();
  const isPlaying = activeSampleId === sample.id;
  const durationLabel = `${Math.max(1, Math.round(sample.endSeconds - sample.startSeconds))}s`;

  return (
    <Button
      variant={isPlaying ? "secondary" : "outline"}
      size="sm"
      onClick={() => {
        if (isPlaying) {
          stopSpeakerSamplePreview();
          return;
        }

        void playSpeakerSamplePreview(sample).catch(() => {
          stopSpeakerSamplePreview();
        });
      }}
    >
      {isPlaying ? `Stop ${durationLabel}` : `Play ${durationLabel}`}
    </Button>
  );
}

function SpeakerProfileCard({
  profile,
  busy,
}: {
  profile: SpeakerProfile;
  busy: boolean;
}) {
  const [draftName, setDraftName] = useState(profile.name);

  return (
    <div className="rounded-[calc(var(--radius)-4px)] border border-[color:var(--border)] bg-white/70 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Input
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
              }}
              disabled={busy}
              className="max-w-[240px]"
              aria-label={`Speaker name for ${profile.name}`}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy || draftName.trim() === profile.name}
              onClick={() => {
                appStore.updateSpeakerProfileName(profile.id, draftName);
              }}
            >
              Save
            </Button>
          </div>
          <p className="mt-2 text-sm text-zinc-600">
            {profile.samples.length} confirmed {profile.samples.length === 1 ? "sample" : "samples"}
            {profile.updatedAt ? ` · Updated ${formatDateTime(profile.updatedAt)}` : ""}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => {
            appStore.deleteSpeakerProfile(profile.id);
          }}
        >
          Remove person
        </Button>
      </div>

      <div className="mt-4 grid gap-3">
        {profile.samples.map((sample) => (
          <div
            key={sample.id}
            className="flex flex-col gap-3 rounded-[var(--radius-control-sm)] border border-zinc-200 bg-zinc-50/80 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-900">
                {Math.round(sample.startSeconds)}s to {Math.round(sample.endSeconds)}s
              </p>
              <p className="text-xs text-zinc-500">
                {sample.addedAt ? formatDateTime(sample.addedAt) : "Saved locally"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SpeakerSampleButton sample={sample} />
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => {
                  appStore.deleteSpeakerProfileSample(profile.id, sample.id);
                }}
              >
                Remove
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SettingsScreen() {
  const snapshot = useAppState();
  const settingsReady = Boolean(snapshot.generalSettings && snapshot.summarySettings && snapshot.modelSettings);
  const [targetSettingsSection, setTargetSettingsSection] = useState<SettingsSection | null>(() =>
    readTargetSettingsSection(),
  );
  const [settingsScrollTop, setSettingsScrollTop] = useState(0);
  const [apiKeyFieldFocused, setApiKeyFieldFocused] = useState(false);
  const [summaryApiKeyDeleteRequested, setSummaryApiKeyDeleteRequested] = useState(false);
  const settingsLoadNote =
    snapshot.permissionNote || snapshot.generalNote || snapshot.summaryNote || snapshot.speakerProfilesNote;
  const settingsContentWidthClass = isSettingsWindow ? "max-w-[640px]" : "max-w-[760px]";
  const settingsShellHeightClass = isSettingsWindow ? "h-screen" : windowShellHeightClass;
  const settingsContentInsetClass = isSettingsWindow ? "px-4 pt-12 pb-6" : "px-5 pt-5 pb-6";
  const settingsTitleOpacity = isSettingsWindow ? Math.max(0, 1 - settingsScrollTop / 24) : 1;
  const settingsTitle = isSettingsWindow ? (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 z-30 flex h-10 items-center justify-center px-16"
      style={{ opacity: settingsTitleOpacity }}
    >
      <span className="max-w-full select-none truncate text-[15px] font-semibold tracking-[-0.01em] text-zinc-800/90">
        Settings
      </span>
    </div>
  ) : null;

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
    if (!settingsReady || !targetSettingsSection) {
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
      <section className={cn("mx-auto flex min-w-0 items-center", settingsContentWidthClass, settingsShellHeightClass)}>
        {settingsTitle}
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
  const audioDeviceSettings = snapshot.audioDeviceSettings;
  const timezoneOptions = getTimezoneOptions(snapshot);
  const microphoneOptions = (audioDeviceSettings?.inputDevices ?? []).map(
    (device): SearchableOption => ({
      value: device.id,
      label: device.name,
    }),
  );
  const speakerOptions = (audioDeviceSettings?.outputDevices ?? []).map(
    (device): SearchableOption => ({
      value: device.id,
      label: device.name,
    }),
  );
  const selectedInputDeviceId =
    audioDeviceSettings?.inputDevices.find((device) => device.isDefault)?.id ?? "";
  const selectedOutputDeviceId =
    audioDeviceSettings?.outputDevices.find((device) => device.isDefault)?.id ?? "";
  const modelReady = Boolean(modelSettings.selectedReady);
  const downloadStatus = snapshot.modelDownload?.status ?? "idle";
  const showModelDownloadGauge = snapshot.modelBusy || downloadStatus === "downloading";
  const modelStatusLabel =
    downloadStatus === "downloading"
      ? "downloading"
      : modelReady
        ? "ready"
        : "needs setup";
  const modelStatusActive = downloadStatus === "downloading" || modelReady;
  const modelOptions = modelSettings.availableModels
    .map((option): SearchableOption => ({
      value: option.id,
      label: option.label,
      detail: option.sizeLabel,
      icon: option.id === "omnilingual" ? "omnilingual" : undefined,
      logoSrc: speechModelLogos[option.id],
      logoClassName: speechModelLogoClassNames[option.id],
      badges: [
        {
          label: option.processingMode === "realtime" ? "Realtime" : "Batch",
          variant: option.processingMode === "realtime" ? "info" : "outline",
        },
      ],
      searchTerms:
        option.id === "parakeetStreaming"
          ? [option.label, "Parakeet Realtime", "streaming", "realtime", option.languagesLabel, "NVIDIA"]
        : option.id === "parakeetBatch"
          ? [option.label, "Parakeet Batch", "batch", option.languagesLabel, "NVIDIA"]
        : option.id === "omnilingual"
          ? [option.languagesLabel, "Meta", "facebookresearch", "Omnilingual ASR"]
        : option.id.startsWith("qwen")
          ? [option.languagesLabel, "Qwen"]
          : [option.languagesLabel],
    }));
  const selectedSummaryProvider = getSummaryProviderDefinition(snapshot.summaryDraft.provider);
  const summaryStatusLabel = !snapshot.summarySettings.provider
    ? "off"
    : snapshot.summarySettings.ready
      ? "ready"
      : "needs setup";
  const summaryStatusActive = snapshot.summarySettings.ready;
  const savedSummaryApiKey =
    snapshot.summaryDraft.apiKeyPresent && !snapshot.summaryDraft.apiKeyDirty;
  const showSavedSummaryApiKeyMask =
    savedSummaryApiKey && !snapshot.summaryDraft.apiKey && !apiKeyFieldFocused;
  const showSummaryBaseUrlField = selectedSummaryProvider?.id === "custom";
  const apiKeyPlaceholder = showSavedSummaryApiKeyMask
    ? ""
    : savedSummaryApiKey
      ? "Replace API key"
      : selectedSummaryProvider?.requiresApiKey
        ? "Paste API key"
        : "Optional API key";

  return (
    <section className={cn("flex min-h-0 min-w-0 flex-col overflow-x-hidden", settingsShellHeightClass)}>
      {settingsTitle}
      <div className="relative min-h-0 min-w-0 flex-1 overflow-x-hidden">
        <div
          className="h-full overflow-x-hidden overflow-y-auto"
          onScroll={(event) => {
            if (!isSettingsWindow) {
              return;
            }

            setSettingsScrollTop(event.currentTarget.scrollTop);
          }}
        >
          <div className={cn("mx-auto flex min-w-0 flex-col gap-6", settingsContentWidthClass, settingsContentInsetClass)}>
            <Card className="overflow-visible">
              <CardHeader className="pb-2">
                <CardTitle>General</CardTitle>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Main language</p>
                  <SettingsSelect
                    ariaLabel="Main language"
                    value={snapshot.generalDraft.mainLanguage}
                    onChange={appStore.setMainLanguage}
                    options={LANGUAGE_OPTIONS}
                    placeholder="Select language"
                    disabled={snapshot.generalBusy}
                  />
                </div>

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Timezone</p>
                  <SettingsSelect
                    ariaLabel="Timezone"
                    value={snapshot.generalDraft.timezone || systemTimezone}
                    onChange={(nextValue) => {
                      appStore.setTimezone(nextValue === systemTimezone ? "" : nextValue);
                    }}
                    options={timezoneOptions}
                    placeholder={`System default (${systemTimezone})`}
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
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle>Audio</CardTitle>
                <CardAction>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-zinc-500 hover:bg-zinc-100"
                    aria-label="Refresh audio devices"
                    title="Refresh audio devices"
                    disabled={snapshot.audioDeviceRefreshBusy || snapshot.generalBusy}
                    onClick={() => {
                      void appStore.refreshAudioDevices();
                    }}
                  >
                    <RefreshCw
                      className={cn("size-4", snapshot.audioDeviceRefreshBusy && "animate-spin")}
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </Button>
                </CardAction>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                <Field className="gap-3">
                  <FieldLabel>Microphone</FieldLabel>
                  <SettingsSelect
                    ariaLabel="Microphone"
                    value={selectedInputDeviceId}
                    onChange={appStore.setAudioInputDevice}
                    options={microphoneOptions}
                    placeholder={
                      audioDeviceSettings ? "Select microphone" : "Loading microphones..."
                    }
                    disabled={snapshot.generalBusy || microphoneOptions.length === 0}
                  />
                </Field>

                <Field className="gap-3">
                  <FieldLabel>Speaker</FieldLabel>
                  <SettingsSelect
                    ariaLabel="Speaker"
                    value={selectedOutputDeviceId}
                    onChange={appStore.setAudioOutputDevice}
                    options={speakerOptions}
                    placeholder={audioDeviceSettings ? "Select speaker" : "Loading speakers..."}
                    disabled={snapshot.generalBusy || speakerOptions.length === 0}
                  />
                </Field>

                <Field className="gap-3">
                  <FieldLabel>Save audio after meeting</FieldLabel>
                  <SettingsSelect
                    ariaLabel="Save audio after meeting"
                    value={snapshot.generalDraft.audioRetention}
                    onChange={(nextValue) => {
                      appStore.setAudioRetention(nextValue as AudioRetentionPolicy);
                    }}
                    options={audioRetentionOptions}
                    placeholder="Select retention"
                    disabled={snapshot.generalBusy}
                  />
                  {snapshot.generalDraft.audioRetention === "none" ? (
                    <FieldDescription className="text-sm text-rose-700">
                      Need audio files to run post-processing.
                    </FieldDescription>
                  ) : null}
                </Field>
              </CardPanel>
            </Card>

            <Card className="overflow-visible">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <CardTitle>People</CardTitle>
                  <SettingsStatusDot
                    active={snapshot.speakerProfiles.length > 0}
                    label={snapshot.speakerProfiles.length > 0 ? "ready" : "empty"}
                  />
                </div>
                <CardDescription>
                  Confirmed speakers are learned from transcript labels and kept locally with a few short reference snippets for later matching.
                </CardDescription>
              </CardHeader>
              <CardPanel className="grid gap-4 pt-0">
                {snapshot.speakerProfiles.length === 0 ? (
                  <div className="rounded-[calc(var(--radius)-4px)] border border-dashed border-zinc-300 bg-zinc-50/70 px-4 py-4 text-sm text-zinc-600">
                    Rename a diarized speaker in any meeting to start building the speaker library.
                  </div>
                ) : (
                  snapshot.speakerProfiles.map((profile) => (
                    <SpeakerProfileCard
                      key={`${profile.id}-${profile.updatedAt}`}
                      profile={profile}
                      busy={snapshot.speakerProfilesBusy}
                    />
                  ))
                )}
                {snapshot.speakerProfilesNote ? (
                  <FieldDescription className="text-sm text-rose-700">
                    {snapshot.speakerProfilesNote}
                  </FieldDescription>
                ) : null}
              </CardPanel>
            </Card>

            <Card id={TRANSCRIPTION_MODEL_SETTINGS_SECTION_ID} className="overflow-visible">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <CardTitle>Transcription model</CardTitle>
                  <SettingsStatusDot active={modelStatusActive} label={modelStatusLabel} />
                </div>
              </CardHeader>
              <CardPanel className="grid gap-6 pt-0">
                {!modelReady && !showModelDownloadGauge ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex items-center gap-2">
                      <CircleAlert
                        aria-hidden="true"
                        className="size-4 shrink-0 text-rose-500"
                        strokeWidth={2}
                      />
                      <Button
                        size="sm"
                        className="shrink-0"
                        disabled={snapshot.modelBusy}
                        onClick={() => {
                          void appStore.startManagedModelDownload();
                        }}
                      >
                        <span className="text-white">Download model</span>
                      </Button>
                    </div>
                    <p className="text-sm font-medium text-zinc-900">to start using.</p>
                  </div>
                ) : null}

                <div className="grid gap-3">
                  <p className="text-sm font-semibold text-zinc-950">Model</p>
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <SettingsSelect
                        ariaLabel="Model"
                        value={snapshot.modelSettings.selectedModelId}
                        onChange={(nextValue) => {
                          appStore.setSelectedModel(nextValue as SpeechModelId);
                        }}
                        options={modelOptions}
                        placeholder="Select model"
                        disabled={snapshot.modelBusy || downloadStatus === "downloading"}
                        className="min-w-0 flex-1"
                      />
                    </div>

                    {showModelDownloadGauge ? (
                      <ModelDownloadGauge busy={snapshot.modelBusy} download={snapshot.modelDownload} />
                    ) : null}
                  </div>
                </div>

              </CardPanel>
            </Card>

            <Card id={AI_SUMMARIES_SETTINGS_SECTION_ID} className="overflow-visible">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2.5">
                  <CardTitle>AI summaries</CardTitle>
                  <SettingsStatusDot active={summaryStatusActive} label={summaryStatusLabel} />
                </div>
              </CardHeader>
            <CardPanel className="grid gap-6 pt-0">
                <Field className="gap-3">
                  <div className="flex w-full items-center justify-between gap-3">
                    <FieldLabel>Provider</FieldLabel>
                    {snapshot.summaryDraft.provider ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={snapshot.summaryBusy}
                        onClick={() => {
                          appStore.setSummaryProvider("");
                        }}
                      >
                        Clear
                      </Button>
                    ) : null}
                  </div>
                  <SettingsSelect
                    ariaLabel="Summary provider"
                    value={snapshot.summaryDraft.provider}
                    onChange={appStore.setSummaryProvider}
                    options={summaryProviderOptions}
                    placeholder="Select provider"
                    disabled={snapshot.summaryBusy}
                  />
                </Field>

                {snapshot.summaryDraft.provider ? (
                  <>
                    <Field className="gap-3">
                      <FieldLabel>Model</FieldLabel>
                      <Input
                        value={snapshot.summaryDraft.model}
                        onChange={(event) => {
                          appStore.setSummaryModel(event.target.value);
                        }}
                        placeholder={selectedSummaryProvider?.modelPlaceholder ?? "Model id"}
                        disabled={snapshot.summaryBusy}
                      />
                    </Field>

                    {showSummaryBaseUrlField ? (
                      <Field>
                        <FieldLabel>Base URL</FieldLabel>
                        <Input
                          value={snapshot.summaryDraft.baseUrl}
                          onChange={(event) => {
                            appStore.setSummaryBaseUrl(event.target.value);
                          }}
                          placeholder={selectedSummaryProvider?.defaultBaseUrl || "https://example.com/v1"}
                          disabled={snapshot.summaryBusy}
                        />
                      </Field>
                    ) : null}

                    <Field>
                      <FieldLabel>API key</FieldLabel>
                      <div className="flex w-full flex-col gap-2">
                        <div className="relative">
                          <Input
                            className={cn("flex-1", savedSummaryApiKey && "pr-11")}
                            type="text"
                            autoComplete="off"
                            spellCheck={false}
                            value={snapshot.summaryDraft.apiKey}
                            onChange={(event) => {
                              appStore.setSummaryApiKey(event.target.value);
                            }}
                            onFocus={() => {
                              setApiKeyFieldFocused(true);
                            }}
                            onBlur={() => {
                              setApiKeyFieldFocused(false);
                            }}
                            placeholder={apiKeyPlaceholder}
                            style={snapshot.summaryDraft.apiKey ? MASKED_TEXT_INPUT_STYLE : undefined}
                            disabled={snapshot.summaryBusy}
                          />
                          {showSavedSummaryApiKeyMask ? (
                            <span
                              aria-hidden="true"
                              className="pointer-events-none absolute inset-y-0 left-3 right-11 flex items-center overflow-hidden text-sm tracking-[0.28em] text-zinc-500"
                            >
                              ••••••••••••••••
                            </span>
                          ) : null}
                          {savedSummaryApiKey ? (
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    className="group absolute right-2 top-1/2 -translate-y-1/2 rounded-full text-zinc-500 hover:bg-transparent"
                                    aria-label="Delete saved API key"
                                    disabled={snapshot.summaryBusy}
                                  />
                                }
                                onClick={() => {
                                  setSummaryApiKeyDeleteRequested(true);
                                }}
                              >
                                <span className="relative flex size-4 items-center justify-center">
                                  <Check
                                    className="size-4 text-emerald-600 transition-opacity duration-150 group-hover:opacity-0"
                                    strokeWidth={2.2}
                                    aria-hidden="true"
                                  />
                                  <Trash2
                                    className="absolute size-4 text-rose-600 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                                    strokeWidth={2}
                                    aria-hidden="true"
                                  />
                                </span>
                              </TooltipTrigger>
                              <TooltipPopup side="top" align="end">
                                Delete saved key
                              </TooltipPopup>
                            </Tooltip>
                          ) : null}
                        </div>
                        {savedSummaryApiKey ? (
                          <FieldDescription>
                            Safely saved in the macOS Keychain.
                          </FieldDescription>
                        ) : null}
                      </div>
                    </Field>
                  </>
                ) : null}

              </CardPanel>
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
      <DeleteSummaryApiKeyDialog
        open={savedSummaryApiKey && summaryApiKeyDeleteRequested}
        onCancel={() => {
          setSummaryApiKeyDeleteRequested(false);
        }}
        onConfirm={() => {
          setSummaryApiKeyDeleteRequested(false);
          void appStore.removeSummaryApiKey();
        }}
      />
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
