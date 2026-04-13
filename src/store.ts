import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

export type PermissionKind = "microphone" | "systemAudio";
export type PermissionStatus = "neverRequested" | "authorized" | "denied";
export type MeetingStatus = "live" | "done";
export type ProcessingMode = "realtime" | "batch";
export type SpeechModelId =
  | "parakeetStreaming"
  | "parakeetBatch"
  | "omnilingual"
  | "qwen3Small"
  | "qwen3Large";

export type OnboardingState = {
  productName: string;
  engine: string;
  reference: string;
  permissions: Record<PermissionKind, PermissionStatus>;
  ready: boolean;
};

export type TranscriptSource = "microphone" | "system" | "mixed";

export type TranscriptEntry = {
  text: string;
  source: TranscriptSource;
};

export type Meeting = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
  transcript: TranscriptEntry[];
  audioPath: string;
  requestedSpeakerCount: number | null;
  diarizationSegments: DiarizationSegment[];
  diarizationSpeakerCount: number;
  diarizationPipelineSource: string | null;
  diarizationRanAt: string | null;
  summary: string | null;
  summaryProviderLabel: string | null;
  summaryModel: string | null;
  summaryUpdatedAt: string | null;
  exportPath: string | null;
};

export type ModelSettings = {
  processingMode: ProcessingMode;
  batchModelId: SpeechModelId;
  selectedModelId: SpeechModelId;
  selectedModelLabel: string;
  selectedModelRepo: string;
  selectedModelDetail: string;
  selectedModelSizeLabel: string;
  selectedModelLanguagesLabel: string;
  selectedModelLocalPath: string;
  selectedModelStatus: string;
  availableModels: SpeechModelOption[];
  recommendedModelId: SpeechModelId;
  recommendationReason: string;
  deviceProfile: DeviceProfile;
  selectedReady: boolean;
  selectedReference: string | null;
};

export type SpeechModelOption = {
  id: SpeechModelId;
  label: string;
  detail: string;
  processingMode: ProcessingMode;
  repo: string;
  localPath: string;
  ready: boolean;
  languagesLabel: string;
  sizeLabel: string;
  recommended: boolean;
};

export type DeviceProfile = {
  chipLabel: string;
  memoryGb: number;
};

export type ManagedModelDownloadStatus = "idle" | "downloading" | "ready" | "error";

export type ManagedModelDownloadState = {
  status: ManagedModelDownloadStatus;
  localPath: string;
  currentFile: string | null;
  bytesDownloaded: number;
  totalBytes: number | null;
  error: string | null;
};

export type DiarizationSettings = {
  enabled: boolean;
  providerLabel: string;
  pipelineRepo: string;
  localPath: string;
  resolvedLocalPath: string | null;
  localReady: boolean;
  huggingFaceTokenPresent: boolean;
  huggingFaceTokenSourceLabel: string | null;
  ready: boolean;
  status: string;
};

export type GeneralSettings = {
  mainLanguage: string;
  spokenLanguages: string[];
  timezone: string;
};

type GeneralDraft = GeneralSettings;

export type SummarySettings = {
  provider: string;
  providerLabel: string;
  model: string;
  baseUrl: string;
  resolvedBaseUrl: string;
  apiKeyPresent: boolean;
  ready: boolean;
  status: string;
};

type SummaryDraft = {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
  apiKeyDirty: boolean;
  apiKeyPresent: boolean;
};

export type DiarizationSegment = {
  speaker: string;
  startSeconds: number;
  endSeconds: number;
};

type LocalDiarizationResult = {
  audioPath: string;
  pipelineSource: string;
  speakerCount: number;
  segments: DiarizationSegment[];
};

type MarkdownExport = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
  audioPath: string;
  summary: string;
  summaryProviderLabel: string;
  summaryModel: string;
  summaryUpdatedAt: string | null;
  diarizationSpeakerCount: number;
  diarizationPipelineSource: string | null;
  diarizationRanAt: string | null;
  path: string | null;
  transcript: string;
  speakerTurns: string;
};

type LiveTranscriptionState = {
  running: boolean;
  text: string;
  error: string | null;
  entries: TranscriptEntry[];
  audioPath: string;
  mode: ProcessingMode | null;
};

type GeneratedTranscriptSummary = {
  summary: string;
  providerLabel: string;
  model: string;
};

type AppState = {
  initialized: boolean;
  onboarding: OnboardingState | null;
  modelSettings: ModelSettings | null;
  modelDownload: ManagedModelDownloadState | null;
  diarizationSettings: DiarizationSettings | null;
  generalSettings: GeneralSettings | null;
  generalDraft: GeneralDraft;
  summarySettings: SummarySettings | null;
  summaryDraft: SummaryDraft;
  meetings: Meeting[];
  permissionNote: string;
  generalNote: string;
  summaryNote: string;
  modelBusy: boolean;
  generalBusy: boolean;
  summaryBusy: boolean;
  startMeetingBusy: boolean;
  transcriptionBusy: boolean;
  transcriptionStopping: boolean;
  transcriptionRunning: boolean;
  liveTranscriptText: string;
  liveTranscriptEntries: TranscriptEntry[];
  liveTranscriptionMode: ProcessingMode | null;
  recordingMeetingId: string | null;
  diarizationRunBusy: boolean;
  summaryMeetingId: string | null;
  meetingNote: string;
  homeScrollTop: number;
};

type SetupBannerContent = {
  kicker: string;
  title: string;
  copy: string;
  detail: string;
  localPath: string;
  actionLabel: string | null;
} | null;

const STORE_KEY = "unsigned-char-meetings";
const isMacLike = /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
export const NEW_MEETING_SHORTCUT = isMacLike ? "⌘N" : "Ctrl+N";
const SETTINGS_WINDOW_LABEL = "settings";
const LIVE_TRANSCRIPTION_POLL_MS = 1200;
const LIVE_TRANSCRIPTION_STOP_WAIT_MS = 250;
const MODEL_DOWNLOAD_POLL_MS = 1000;
const MODEL_DOWNLOAD_START_GRACE_MS = 4000;
const MEETING_MARKDOWN_SYNC_MS = 250;
const MARKDOWN_SAVE_ERROR_PREFIX = "Markdown save failed:";
const liveTranscriptionPermissionKinds: PermissionKind[] = ["microphone", "systemAudio"];
type PendingAutoDiarization = {
  meetingId: string;
  speakerCount: number | null;
};

const pendingAutoDiarizationRuns: PendingAutoDiarization[] = [];
let autoDiarizationDrainRunning = false;
let modelDownloadStartDeadline = 0;

export const currentWindow = getCurrentWindow();
export const isSettingsWindow = currentWindow.label === SETTINGS_WINDOW_LABEL;

const COMMON_LANGUAGE_CODES = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "pl",
  "ru",
  "uk",
  "tr",
  "ar",
  "hi",
  "id",
  "ja",
  "ko",
  "th",
  "vi",
  "zh",
] as const;

export const COMMON_TIMEZONES = [
  { value: "Pacific/Honolulu", label: "Hawaii", detail: "UTC-10" },
  { value: "America/Anchorage", label: "Alaska", detail: "UTC-9" },
  { value: "America/Los_Angeles", label: "Pacific Time", detail: "UTC-8" },
  { value: "America/Denver", label: "Mountain Time", detail: "UTC-7" },
  { value: "America/Chicago", label: "Central Time", detail: "UTC-6" },
  { value: "America/New_York", label: "Eastern Time", detail: "UTC-5" },
  { value: "America/Sao_Paulo", label: "Sao Paulo", detail: "UTC-3" },
  { value: "Atlantic/Reykjavik", label: "Reykjavik", detail: "UTC+0" },
  { value: "Europe/London", label: "London", detail: "UTC+0/+1" },
  { value: "Europe/Paris", label: "Paris", detail: "UTC+1/+2" },
  { value: "Europe/Berlin", label: "Berlin", detail: "UTC+1/+2" },
  { value: "Africa/Cairo", label: "Cairo", detail: "UTC+2" },
  { value: "Europe/Moscow", label: "Moscow", detail: "UTC+3" },
  { value: "Asia/Dubai", label: "Dubai", detail: "UTC+4" },
  { value: "Asia/Kolkata", label: "India", detail: "UTC+5:30" },
  { value: "Asia/Bangkok", label: "Bangkok", detail: "UTC+7" },
  { value: "Asia/Singapore", label: "Singapore", detail: "UTC+8" },
  { value: "Asia/Shanghai", label: "China", detail: "UTC+8" },
  { value: "Asia/Tokyo", label: "Tokyo", detail: "UTC+9" },
  { value: "Asia/Seoul", label: "Seoul", detail: "UTC+9" },
  { value: "Australia/Sydney", label: "Sydney", detail: "UTC+10/+11" },
  { value: "Pacific/Auckland", label: "Auckland", detail: "UTC+12/+13" },
] as const;

const languageDisplayNames =
  typeof Intl.DisplayNames === "function"
    ? new Intl.DisplayNames(undefined, { type: "language" })
    : null;

export const LANGUAGE_OPTIONS = COMMON_LANGUAGE_CODES.map((value) => ({
  value,
  label: formatLanguageLabel(value),
}));

export const PROCESSING_MODE_OPTIONS = [
  {
    value: "realtime",
    label: "Realtime",
    detail: "Live",
  },
  {
    value: "batch",
    label: "Batch",
    detail: "Post-meeting",
  },
] as const;

let state: AppState = {
  initialized: false,
  onboarding: null,
  modelSettings: null,
  modelDownload: null,
  diarizationSettings: null,
  generalSettings: null,
  generalDraft: emptyGeneralDraft(),
  summarySettings: null,
  summaryDraft: emptySummaryDraft(),
  meetings: loadMeetings(),
  permissionNote: "",
  generalNote: "",
  summaryNote: "",
  modelBusy: false,
  generalBusy: false,
  summaryBusy: false,
  startMeetingBusy: false,
  transcriptionBusy: false,
  transcriptionStopping: false,
  transcriptionRunning: false,
  liveTranscriptText: "",
  liveTranscriptEntries: [],
  liveTranscriptionMode: null,
  recordingMeetingId: null,
  diarizationRunBusy: false,
  summaryMeetingId: null,
  meetingNote: "",
  homeScrollTop: 0,
};

const listeners = new Set<() => void>();
let started = false;
let liveTranscriptionPollId: number | null = null;
let modelDownloadPollId: number | null = null;
const meetingMarkdownSyncTimers = new Map<string, number>();

function emit() {
  listeners.forEach((listener) => listener());
}

function patch(next: Partial<AppState>) {
  state = { ...state, ...next };
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function useAppState() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function emptyGeneralDraft(): GeneralDraft {
  return {
    mainLanguage: defaultMainLanguage(),
    spokenLanguages: [],
    timezone: "",
  };
}

function emptySummaryDraft(): SummaryDraft {
  return {
    provider: "",
    model: "",
    baseUrl: "",
    apiKey: "",
    apiKeyDirty: false,
    apiKeyPresent: false,
  };
}

export function formatLanguageLabel(code: string) {
  const value = languageDisplayNames?.of(code) ?? code;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function normalizeLanguageCode(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  const exactMatch = LANGUAGE_OPTIONS.find((option) => option.value === lower);
  if (exactMatch) {
    return exactMatch.value;
  }

  const baseLanguage = lower.split("-")[0];
  const baseMatch = LANGUAGE_OPTIONS.find((option) => option.value === baseLanguage);
  return baseMatch?.value ?? "";
}

function defaultMainLanguage() {
  return normalizeLanguageCode(window.navigator.language) || "en";
}

export function normalizeSpokenLanguages(languages: string[], mainLanguage: string) {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const language of languages) {
    const code = normalizeLanguageCode(language);
    if (!code || code === mainLanguage || seen.has(code)) {
      continue;
    }

    seen.add(code);
    normalized.push(code);
  }

  return normalized;
}

export function filterSpokenLanguageOptions(
  query: string,
  mainLanguage: string,
  spokenLanguages: string[],
) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [];
  }

  return LANGUAGE_OPTIONS.filter(
    (option) =>
      option.value !== mainLanguage &&
      !spokenLanguages.includes(option.value) &&
      (option.label.toLowerCase().includes(needle) || option.value.includes(needle)),
  );
}

function syncGeneralDraft(settings: GeneralSettings) {
  const mainLanguage = normalizeLanguageCode(settings.mainLanguage) || defaultMainLanguage();
  return {
    mainLanguage,
    spokenLanguages: normalizeSpokenLanguages(settings.spokenLanguages, mainLanguage),
    timezone: settings.timezone.trim(),
  };
}

function syncSummaryDraft(settings: SummarySettings): SummaryDraft {
  return {
    provider: settings.provider.trim(),
    model: settings.model.trim(),
    baseUrl: settings.baseUrl.trim(),
    apiKey: "",
    apiKeyDirty: false,
    apiKeyPresent: settings.apiKeyPresent,
  };
}

function loadMeetings(): Meeting[] {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map(normalizeMeeting)
      .filter((meeting): meeting is Meeting => meeting !== null);
  } catch {
    return [];
  }
}

function persistMeetings() {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(state.meetings));
}

function normalizeMeeting(value: unknown): Meeting | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.title !== "string" ||
    typeof candidate.createdAt !== "string" ||
    typeof candidate.updatedAt !== "string" ||
    (candidate.status !== "live" && candidate.status !== "done") ||
    !Array.isArray(candidate.transcript)
  ) {
    return null;
  }

  const diarizationSegments = normalizeDiarizationSegments(candidate.diarizationSegments);

  return {
    id: candidate.id,
    title: candidate.title,
    createdAt: candidate.createdAt,
    updatedAt: candidate.updatedAt,
    status: candidate.status,
    transcript: normalizeTranscriptEntries(candidate.transcript),
    audioPath: typeof candidate.audioPath === "string" ? candidate.audioPath : "",
    requestedSpeakerCount: normalizeRequestedSpeakerCount(candidate.requestedSpeakerCount),
    diarizationSegments,
    diarizationSpeakerCount:
      typeof candidate.diarizationSpeakerCount === "number" &&
      Number.isFinite(candidate.diarizationSpeakerCount)
        ? candidate.diarizationSpeakerCount
        : distinctSpeakerCount(diarizationSegments),
    diarizationPipelineSource:
      typeof candidate.diarizationPipelineSource === "string" &&
      candidate.diarizationPipelineSource.length > 0
        ? candidate.diarizationPipelineSource
        : null,
    diarizationRanAt:
      typeof candidate.diarizationRanAt === "string" && candidate.diarizationRanAt.length > 0
        ? candidate.diarizationRanAt
        : null,
    summary:
      typeof candidate.summary === "string" && candidate.summary.trim().length > 0
        ? candidate.summary
        : null,
    summaryProviderLabel:
      typeof candidate.summaryProviderLabel === "string" &&
      candidate.summaryProviderLabel.trim().length > 0
        ? candidate.summaryProviderLabel
        : null,
    summaryModel:
      typeof candidate.summaryModel === "string" && candidate.summaryModel.trim().length > 0
        ? candidate.summaryModel
        : null,
    summaryUpdatedAt:
      typeof candidate.summaryUpdatedAt === "string" && candidate.summaryUpdatedAt.length > 0
        ? candidate.summaryUpdatedAt
        : null,
    exportPath:
      typeof candidate.exportPath === "string" && candidate.exportPath.length > 0
        ? candidate.exportPath
        : null,
  };
}

function isTranscriptSource(value: unknown): value is TranscriptSource {
  return value === "microphone" || value === "system" || value === "mixed";
}

function createTranscriptEntry(text: string, source: TranscriptSource): TranscriptEntry | null {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return null;
  }

  return {
    text: normalizedText,
    source,
  };
}

function normalizeTranscriptComparisonText(text: string) {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseRepeatedTranscriptSpans(text: string) {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return "";
  }

  const words = normalizedText.split(/\s+/);
  const comparableWords = words.map((word) => normalizeTranscriptComparisonText(word));

  let changed = true;
  while (changed) {
    changed = false;

    for (let size = Math.min(12, Math.floor(words.length / 2)); size >= 1; size -= 1) {
      for (let start = 0; start + size * 2 <= words.length; start += 1) {
        let matches = true;
        for (let offset = 0; offset < size; offset += 1) {
          if (comparableWords[start + offset] !== comparableWords[start + size + offset]) {
            matches = false;
            break;
          }
        }

        if (!matches) {
          continue;
        }

        const repeatedSpanLength = comparableWords
          .slice(start, start + size)
          .join(" ")
          .replace(/\s+/g, "").length;
        if (size === 1 && repeatedSpanLength < 3) {
          continue;
        }

        words.splice(start + size, size);
        comparableWords.splice(start + size, size);
        changed = true;
        break;
      }

      if (changed) {
        break;
      }
    }
  }

  return words.join(" ").trim();
}

function transcriptComparisonTokens(text: string) {
  const normalized = normalizeTranscriptComparisonText(collapseRepeatedTranscriptSpans(text));
  return normalized ? normalized.split(" ") : [];
}

function longestCommonSubsequenceLength(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const previous = new Array<number>(right.length + 1).fill(0);
  const current = new Array<number>(right.length + 1).fill(0);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        left[leftIndex - 1] === right[rightIndex - 1]
          ? previous[rightIndex - 1] + 1
          : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }

    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return previous[right.length];
}

function transcriptEntriesSubstantiallyOverlap(left: TranscriptEntry, right: TranscriptEntry) {
  const leftTokens = transcriptComparisonTokens(left.text);
  const rightTokens = transcriptComparisonTokens(right.text);
  const shorterLength = Math.min(leftTokens.length, rightTokens.length);

  if (shorterLength < 6) {
    return false;
  }

  const lcsLength = longestCommonSubsequenceLength(leftTokens, rightTokens);
  return lcsLength / shorterLength >= 0.72;
}

function transcriptEntriesCloselyMatchAcrossSources(left: TranscriptEntry, right: TranscriptEntry) {
  const leftTokens = transcriptComparisonTokens(left.text);
  const rightTokens = transcriptComparisonTokens(right.text);
  const shorterLength = Math.min(leftTokens.length, rightTokens.length);
  const longerLength = Math.max(leftTokens.length, rightTokens.length);

  if (shorterLength < 6 || shorterLength / longerLength < 0.82) {
    return false;
  }

  const lcsLength = longestCommonSubsequenceLength(leftTokens, rightTokens);
  return lcsLength / longerLength >= 0.88;
}

function preferredTranscriptEntry(left: TranscriptEntry, right: TranscriptEntry) {
  const leftLength = transcriptComparisonTokens(left.text).length;
  const rightLength = transcriptComparisonTokens(right.text).length;

  if (leftLength !== rightLength) {
    return rightLength > leftLength ? right : left;
  }

  return right.text.length > left.text.length ? right : left;
}

function preferredCrossSourceTranscriptEntry(left: TranscriptEntry, right: TranscriptEntry) {
  const leftLength = transcriptComparisonTokens(left.text).length;
  const rightLength = transcriptComparisonTokens(right.text).length;

  if (rightLength >= leftLength * 1.2) {
    return right;
  }

  return left;
}

function compactTranscriptEntries(entries: TranscriptEntry[]) {
  const compacted: TranscriptEntry[] = [];

  for (const entry of entries) {
    const text = collapseRepeatedTranscriptSpans(entry.text);
    const candidate = createTranscriptEntry(text, entry.source);
    if (!candidate) {
      continue;
    }

    const lastEntry = compacted[compacted.length - 1];
    if (lastEntry && lastEntry.source === candidate.source) {
      if (transcriptEntriesSubstantiallyOverlap(lastEntry, candidate)) {
        compacted[compacted.length - 1] = preferredTranscriptEntry(lastEntry, candidate);
        continue;
      }
    }

    let merged = false;
    for (let index = compacted.length - 1; index >= Math.max(0, compacted.length - 3); index -= 1) {
      const existing = compacted[index];
      if (existing.source === candidate.source) {
        continue;
      }

      if (!transcriptEntriesCloselyMatchAcrossSources(existing, candidate)) {
        continue;
      }

      compacted[index] = preferredCrossSourceTranscriptEntry(existing, candidate);
      merged = true;
      break;
    }

    if (!merged) {
      compacted.push(candidate);
    }
  }

  return compacted;
}

function normalizeTranscriptEntries(value: unknown): TranscriptEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return compactTranscriptEntries(
    value.flatMap((entry) => {
      if (typeof entry === "string") {
        const normalized = createTranscriptEntry(entry, "mixed");
        return normalized ? [normalized] : [];
      }

      if (!entry || typeof entry !== "object") {
        return [];
      }

      const candidate = entry as Record<string, unknown>;
      if (typeof candidate.text !== "string" || !isTranscriptSource(candidate.source)) {
        return [];
      }

      const normalized = createTranscriptEntry(candidate.text, candidate.source);
      return normalized ? [normalized] : [];
    }),
  );
}

function normalizeDiarizationSegments(value: unknown): DiarizationSegment[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((segment) => {
    if (!segment || typeof segment !== "object") {
      return [];
    }

    const candidate = segment as Record<string, unknown>;
    if (
      typeof candidate.speaker !== "string" ||
      typeof candidate.startSeconds !== "number" ||
      typeof candidate.endSeconds !== "number" ||
      !Number.isFinite(candidate.startSeconds) ||
      !Number.isFinite(candidate.endSeconds)
    ) {
      return [];
    }

    return [
      {
        speaker: candidate.speaker,
        startSeconds: candidate.startSeconds,
        endSeconds: candidate.endSeconds,
      },
    ];
  });
}

function normalizeRequestedSpeakerCount(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function distinctSpeakerCount(segments: DiarizationSegment[]) {
  return new Set(segments.map((segment) => segment.speaker)).size;
}

function activeTimezone() {
  const value = state.generalSettings?.timezone.trim();
  return value || undefined;
}

function formatDateValue(date: Date, options: Intl.DateTimeFormatOptions) {
  const timezone = activeTimezone();

  try {
    return date.toLocaleDateString(undefined, timezone ? { ...options, timeZone: timezone } : options);
  } catch {
    return date.toLocaleDateString(undefined, options);
  }
}

function formatTimeValue(date: Date, options: Intl.DateTimeFormatOptions) {
  const timezone = activeTimezone();

  try {
    return date.toLocaleTimeString(undefined, timezone ? { ...options, timeZone: timezone } : options);
  } catch {
    return date.toLocaleTimeString(undefined, options);
  }
}

function formatDateTimeValue(date: Date, options: Intl.DateTimeFormatOptions) {
  const timezone = activeTimezone();

  try {
    return date.toLocaleString(undefined, timezone ? { ...options, timeZone: timezone } : options);
  } catch {
    return date.toLocaleString(undefined, options);
  }
}

export function formatDate(iso: string) {
  return formatDateValue(new Date(iso), {
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string) {
  return formatDateTimeValue(new Date(iso), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatClockSeconds(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainder.toString().padStart(2, "0")}`;
}

function formatSpeakerTurnsMarkdown(meeting: Meeting) {
  if (meeting.diarizationSegments.length === 0) {
    return "";
  }

  const lines = meeting.diarizationSegments.map((segment) => {
    const range = `${formatClockSeconds(segment.startSeconds)}-${formatClockSeconds(segment.endSeconds)}`;
    return `- ${segment.speaker}: ${range}`;
  });

  if (meeting.diarizationPipelineSource) {
    lines.unshift(`- Pipeline: ${meeting.diarizationPipelineSource}`);
  }

  return lines.join("\n");
}

function transcriptEntriesToText(entries: TranscriptEntry[]) {
  return entries.map((entry) => entry.text).join("\n").trim();
}

function sameTranscriptEntries(left: TranscriptEntry[], right: TranscriptEntry[]) {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) =>
        entry.text === right[index]?.text && entry.source === right[index]?.source,
    )
  );
}

function formatTranscriptLineForExport(entry: TranscriptEntry) {
  if (entry.source === "mixed") {
    return entry.text;
  }

  return `${entry.source === "microphone" ? "Mic" : "System"}: ${entry.text}`;
}

function buildMarkdownExport(meeting: Meeting): MarkdownExport {
  return {
    id: meeting.id,
    title: meeting.title,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    status: meeting.status,
    audioPath: meeting.audioPath.trim(),
    summary: meeting.summary?.trim() ?? "",
    summaryProviderLabel: meeting.summaryProviderLabel?.trim() ?? "",
    summaryModel: meeting.summaryModel?.trim() ?? "",
    summaryUpdatedAt: meeting.summaryUpdatedAt,
    diarizationSpeakerCount: meeting.diarizationSpeakerCount,
    diarizationPipelineSource: meeting.diarizationPipelineSource,
    diarizationRanAt: meeting.diarizationRanAt,
    path: meeting.exportPath,
    transcript: getMeetingTranscriptEntries(meeting).map(formatTranscriptLineForExport).join("\n\n"),
    speakerTurns: formatSpeakerTurnsMarkdown(meeting),
  };
}

export function sortedMeetings(meetings: Meeting[]) {
  return [...meetings].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function getMeetingTranscriptEntries(meeting: Meeting) {
  const entries = [...meeting.transcript];
  const liveEntries =
    state.recordingMeetingId === meeting.id ? state.liveTranscriptEntries : [];

  if (liveEntries.length > 0) {
    entries.push(...liveEntries);
  }

  return entries;
}

export function getMeetingTranscriptLines(meeting: Meeting) {
  return getMeetingTranscriptEntries(meeting).map((entry) => entry.text);
}

export function requiresModelSetup(snapshot: AppState) {
  return Boolean(snapshot.modelSettings && !snapshot.modelSettings.selectedReady);
}

export function requiresAppSetup(snapshot: AppState) {
  return requiresModelSetup(snapshot);
}

function formatByteSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const decimals = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${units[unitIndex]}`;
}

function modelDownloadProgressCopy(download: ManagedModelDownloadState) {
  if (download.totalBytes && download.totalBytes > 0) {
    return `${formatByteSize(download.bytesDownloaded)} of ${formatByteSize(download.totalBytes)}`;
  }

  if (download.bytesDownloaded > 0) {
    return formatByteSize(download.bytesDownloaded);
  }

  return "Preparing download";
}

export function currentSetupBannerContent(snapshot: AppState): SetupBannerContent {
  if (!requiresModelSetup(snapshot) || !snapshot.modelSettings) {
    return null;
  }

  const download = snapshot.modelDownload;
  const isDownloading = download?.status === "downloading";
  const isError = download?.status === "error";
  const selectedModelLabel = snapshot.modelSettings.selectedModelLabel;
  const localPath = download?.localPath || snapshot.modelSettings.selectedModelLocalPath;
  const modeCopy =
    snapshot.modelSettings.processingMode === "batch"
      ? "post-meeting batch transcription"
      : "live transcription";

  if (isDownloading && download) {
    const progress = download.currentFile
      ? download.bytesDownloaded > 0 || download.totalBytes
        ? `${download.currentFile} · ${modelDownloadProgressCopy(download)}`
        : download.currentFile
      : modelDownloadProgressCopy(download);

    return {
      kicker: "Downloading model",
      title: "Transcription model setup in progress",
      copy: `unsigned {char} is downloading ${selectedModelLabel} and storing it locally on this Mac.`,
      detail: progress,
      localPath,
      actionLabel: null,
    };
  }

  if (isError && download) {
    return {
      kicker: "Setup required",
      title: "Transcription model setup failed",
      copy: download.error ?? "The model download did not complete.",
      detail: "Retry to finish local transcription setup.",
      localPath,
      actionLabel: "Retry download",
    };
  }

  return {
    kicker: "Setup required",
    title: "Download transcription model",
    copy: `Download ${selectedModelLabel} once to run ${modeCopy} locally. The model is cached on this device.`,
    detail: snapshot.modelSettings.selectedModelDetail,
    localPath,
    actionLabel: "Download model",
  };
}

export function getTimezoneOptions(snapshot: AppState) {
  const timezone = snapshot.generalDraft.timezone.trim();
  if (!timezone || COMMON_TIMEZONES.some((option) => option.value === timezone)) {
    return COMMON_TIMEZONES;
  }

  return [...COMMON_TIMEZONES, { value: timezone, label: timezone, detail: "Custom" }] as const;
}

function buildMeetingTitle(iso: string) {
  const date = new Date(iso);
  const datePart = formatDateValue(date, { month: "short", day: "numeric" });
  const timePart = formatTimeValue(date, { hour: "numeric", minute: "2-digit" });
  return `Meeting ${datePart} ${timePart}`;
}

function normalizeMeetingTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function getMeeting(id: string) {
  return state.meetings.find((meeting) => meeting.id === id) ?? null;
}

function getRecordingMeeting() {
  return state.meetings.find((meeting) => meeting.id === state.recordingMeetingId) ?? null;
}

function isMeetingEmpty(meeting: Meeting) {
  return (
    meeting.transcript.length === 0 &&
    !meeting.audioPath.trim() &&
    meeting.diarizationSegments.length === 0
  );
}

function shouldSyncMeetingMarkdown(meeting: Meeting) {
  return meeting.status === "done" && !isMeetingEmpty(meeting);
}

function updateMeeting(id: string, updater: (meeting: Meeting) => Meeting) {
  let updatedMeeting: Meeting | null = null;
  state = {
    ...state,
    meetings: state.meetings.map((meeting) => {
      if (meeting.id !== id) {
        return meeting;
      }

      updatedMeeting = updater(meeting);
      return updatedMeeting;
    }),
  };
  persistMeetings();
  if (updatedMeeting) {
    scheduleMeetingMarkdownSync(updatedMeeting);
  }
  emit();
}

function createMeeting(meetingId = crypto.randomUUID(), audioPath = "") {
  const createdAt = new Date().toISOString();
  const meeting: Meeting = {
    id: meetingId,
    title: buildMeetingTitle(createdAt),
    createdAt,
    updatedAt: createdAt,
    status: "live",
    transcript: [],
    audioPath: audioPath.trim(),
    requestedSpeakerCount: null,
    diarizationSegments: [],
    diarizationSpeakerCount: 0,
    diarizationPipelineSource: null,
    diarizationRanAt: null,
    summary: null,
    summaryProviderLabel: null,
    summaryModel: null,
    summaryUpdatedAt: null,
    exportPath: null,
  };

  state = {
    ...state,
    meetings: [meeting, ...state.meetings],
    recordingMeetingId: meeting.id,
  };
  persistMeetings();
  scheduleMeetingMarkdownSync(meeting);
  emit();
  return meeting;
}

function queueMeetingAutoDiarization(meetingId: string) {
  const meeting = getMeeting(meetingId);
  if (!meeting || !meeting.audioPath.trim() || !state.diarizationSettings?.enabled) {
    return;
  }

  if (pendingAutoDiarizationRuns.some((candidate) => candidate.meetingId === meetingId)) {
    return;
  }

  pendingAutoDiarizationRuns.push({
    meetingId,
    speakerCount: meeting.requestedSpeakerCount,
  });
  void drainAutoDiarizationQueue();
}

async function drainAutoDiarizationQueue() {
  if (autoDiarizationDrainRunning || state.diarizationRunBusy) {
    return;
  }

  autoDiarizationDrainRunning = true;

  try {
    while (!state.diarizationRunBusy) {
      const pendingRun = pendingAutoDiarizationRuns.shift();
      if (!pendingRun) {
        break;
      }

      await runMeetingDiarization(pendingRun.meetingId, {
        automatic: true,
        speakerCount: pendingRun.speakerCount,
      });
    }
  } finally {
    autoDiarizationDrainRunning = false;
    if (pendingAutoDiarizationRuns.length > 0 && !state.diarizationRunBusy) {
      void drainAutoDiarizationQueue();
    }
  }
}

function clearMeetingMarkdownSync(meetingId: string) {
  const timer = meetingMarkdownSyncTimers.get(meetingId);
  if (typeof timer !== "number") {
    return;
  }

  window.clearTimeout(timer);
  meetingMarkdownSyncTimers.delete(meetingId);
}

function setMeetingExportPath(id: string, path: string) {
  let changed = false;
  state = {
    ...state,
    meetings: state.meetings.map((meeting) => {
      if (meeting.id !== id || meeting.exportPath === path) {
        return meeting;
      }

      changed = true;
      return {
        ...meeting,
        exportPath: path,
      };
    }),
  };

  if (changed) {
    persistMeetings();
    emit();
  }
}

function currentMeetingIdFromHash() {
  const match = window.location.hash.match(/^#\/meeting\/([^/?#]+)/);
  return match?.[1] ?? null;
}

async function syncMeetingMarkdown(id: string, options?: { force?: boolean }) {
  const meeting = getMeeting(id);
  if (!meeting) {
    return null;
  }

  const force = options?.force === true;
  const exportPath = meeting.exportPath?.trim() || null;

  try {
    if (!force && exportPath) {
      const exists = await invoke<boolean>("meeting_export_exists", { path: exportPath });
      if (!exists) {
        return null;
      }
    }

    const path = await invoke<string>("sync_meeting_markdown", {
      export: buildMarkdownExport(meeting),
    });
    setMeetingExportPath(id, path);

    if (
      currentMeetingIdFromHash() === id &&
      state.meetingNote.startsWith(MARKDOWN_SAVE_ERROR_PREFIX)
    ) {
      patch({ meetingNote: "" });
    }

    return path;
  } catch (error) {
    if (currentMeetingIdFromHash() !== id) {
      return null;
    }

    patch({ meetingNote: `${MARKDOWN_SAVE_ERROR_PREFIX} ${String(error)}` });
    return null;
  }
}

function scheduleMeetingMarkdownSync(meeting: Meeting) {
  clearMeetingMarkdownSync(meeting.id);

  if (isSettingsWindow || !shouldSyncMeetingMarkdown(meeting)) {
    return;
  }

  const nextTimer = window.setTimeout(() => {
    meetingMarkdownSyncTimers.delete(meeting.id);
    void syncMeetingMarkdown(meeting.id);
  }, MEETING_MARKDOWN_SYNC_MS);

  meetingMarkdownSyncTimers.set(meeting.id, nextTimer);
}

function queueLoadedMeetingMarkdownSync() {
  state.meetings.forEach((meeting) => {
    scheduleMeetingMarkdownSync(meeting);
  });
}

function syncLiveTranscriptionPolling() {
  if (isSettingsWindow) {
    return;
  }

  const shouldPoll = state.transcriptionRunning || state.transcriptionBusy;
  if (!shouldPoll) {
    if (liveTranscriptionPollId !== null) {
      window.clearInterval(liveTranscriptionPollId);
      liveTranscriptionPollId = null;
    }
    return;
  }

  if (liveTranscriptionPollId !== null) {
    return;
  }

  liveTranscriptionPollId = window.setInterval(() => {
    void refreshLiveTranscription(true);
  }, LIVE_TRANSCRIPTION_POLL_MS);
}

function syncModelDownloadPolling() {
  const shouldPoll = state.modelDownload?.status === "downloading";
  if (!shouldPoll) {
    if (modelDownloadPollId !== null) {
      window.clearInterval(modelDownloadPollId);
      modelDownloadPollId = null;
    }
    return;
  }

  if (modelDownloadPollId !== null) {
    return;
  }

  modelDownloadPollId = window.setInterval(() => {
    void refreshManagedModelDownloadState(true);
  }, MODEL_DOWNLOAD_POLL_MS);
}

function modelDownloadStartPending() {
  return modelDownloadStartDeadline > Date.now();
}

function optimisticModelDownloadState(): ManagedModelDownloadState {
  const selectedModelLabel = state.modelSettings?.selectedModelLabel ?? "transcription model";

  return {
    status: "downloading",
    localPath: state.modelSettings?.selectedModelLocalPath || state.modelDownload?.localPath || "",
    currentFile: `Preparing ${selectedModelLabel}...`,
    bytesDownloaded: 0,
    totalBytes: null,
    error: null,
  };
}

async function refreshPermissions(silent = false) {
  try {
    const onboarding = await invoke<OnboardingState>("onboarding_state");
    patch({ onboarding });
  } catch (error) {
    if (!silent) {
      patch({ permissionNote: `Failed to load permissions: ${String(error)}` });
    }
  }
}

async function refreshModelSettings(silent = false) {
  try {
    const modelSettings = await invoke<ModelSettings>("model_settings_state");
    patch({ modelSettings });
  } catch (error) {
    if (!silent) {
      patch({ permissionNote: `Failed to load model settings: ${String(error)}` });
    }
  }
}

async function refreshManagedModelDownloadState(silent = false) {
  const previousStatus = state.modelDownload?.status ?? null;
  const previousDownload = state.modelDownload;

  try {
    const modelDownload = await invoke<ManagedModelDownloadState>("managed_model_download_state");
    if (
      previousStatus === "downloading" &&
      modelDownload.status === "idle" &&
      previousDownload &&
      modelDownloadStartPending()
    ) {
      syncModelDownloadPolling();
      return;
    }

    let nextDownload = modelDownload;
    if (previousStatus === "downloading" && modelDownload.status === "idle" && previousDownload) {
      nextDownload = {
        ...previousDownload,
        status: "error",
        currentFile: null,
        error: "Model download did not start. Try again.",
      };
    }

    if (nextDownload.status !== "downloading") {
      modelDownloadStartDeadline = 0;
    }

    patch({ modelDownload: nextDownload });
    syncModelDownloadPolling();

    if (previousStatus === "downloading" && nextDownload.status !== "downloading") {
      await Promise.all([refreshModelSettings(true), refreshPermissions(true)]);
    }
  } catch (error) {
    modelDownloadStartDeadline = 0;
    if (!silent) {
      patch({ permissionNote: `Failed to load model download state: ${String(error)}` });
    }
  }
}

async function refreshDiarizationSettings(silent = false) {
  try {
    const diarizationSettings = await invoke<DiarizationSettings>("diarization_settings_state");
    patch({ diarizationSettings });
  } catch (error) {
    if (!silent) {
      patch({ meetingNote: `Failed to load diarization settings: ${String(error)}` });
    }
  }
}

async function refreshGeneralSettings(silent = false) {
  try {
    const generalSettings = await invoke<GeneralSettings>("general_settings_state");
    patch({
      generalSettings,
      generalDraft: syncGeneralDraft(generalSettings),
    });
  } catch (error) {
    if (!silent) {
      patch({ generalNote: `Failed to load settings: ${String(error)}` });
    }
  }
}

async function refreshSummarySettings(silent = false) {
  try {
    const summarySettings = await invoke<SummarySettings>("summary_settings_state");
    patch({
      summarySettings,
      summaryDraft: syncSummaryDraft(summarySettings),
      summaryNote: "",
    });
  } catch (error) {
    if (!silent) {
      patch({ summaryNote: `Failed to load summary settings: ${String(error)}` });
    }
  }
}

async function refreshSettingsWindowData(silent = false) {
  await Promise.all([
    refreshGeneralSettings(silent),
    refreshSummarySettings(silent),
    refreshManagedModelDownloadState(silent),
    refreshModelSettings(silent),
  ]);
}

async function ensureModelReady() {
  await refreshModelSettings(true);

  if (!state.modelSettings) {
    throw new Error("Model settings are still loading.");
  }

  if (state.modelSettings.selectedReady) {
    return;
  }

  if (state.modelDownload?.status === "downloading") {
    throw new Error("The transcription model is still downloading.");
  }

  if (state.modelDownload?.status === "error" && state.modelDownload.error) {
    throw new Error(state.modelDownload.error);
  }

  throw new Error(state.modelSettings.selectedModelStatus);
}

async function ensureDiarizationReady() {
  await refreshDiarizationSettings(true);

  if (!state.diarizationSettings) {
    throw new Error("Diarization settings are still loading.");
  }

  if (!state.diarizationSettings.enabled) {
    throw new Error("Speaker diarization is not available in this build yet.");
  }

  if (state.diarizationSettings.ready) {
    return;
  }

  throw new Error(state.diarizationSettings.status);
}

function permissionLabel(permission: PermissionKind) {
  return permission === "microphone" ? "Microphone" : "System audio";
}

async function requestPermissionForMeeting(permission: PermissionKind) {
  await refreshPermissions(true);
  const status = state.onboarding?.permissions[permission];
  if (!status || status === "authorized") {
    return;
  }

  if (status === "denied") {
    await invoke("open_permission_settings", { permission });
    throw new Error(`${permissionLabel(permission)} access is off. Enable it in System Settings and try again.`);
  }

  await invoke("request_permission", { permission });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    await refreshPermissions(true);
    if (state.onboarding?.permissions[permission] !== "neverRequested") {
      break;
    }
  }

  const nextStatus = state.onboarding?.permissions[permission];
  if (nextStatus === "denied") {
    await invoke("open_permission_settings", { permission });
    throw new Error(`${permissionLabel(permission)} access is required to start a meeting.`);
  }
}

async function prepareMeetingPermissions() {
  await requestPermissionForMeeting(liveTranscriptionPermissionKinds[0]);

  try {
    await requestPermissionForMeeting(liveTranscriptionPermissionKinds[1]);
  } catch (error) {
    patch({
      meetingNote: error instanceof Error ? error.message : String(error),
    });
  }
}

async function startLiveTranscriptionSession(meetingId: string) {
  const snapshot = await invoke<LiveTranscriptionState>("start_live_transcription", {
    meetingId,
  });
  if (snapshot.error) {
    throw new Error(snapshot.error);
  }

  if (!snapshot.running) {
    throw new Error("Failed to start local transcription.");
  }

  const liveTranscriptEntries = normalizeTranscriptEntries(snapshot.entries);
  const liveTranscriptText = transcriptEntriesToText(liveTranscriptEntries) || snapshot.text.trim();

  state = {
    ...state,
    recordingMeetingId: meetingId,
    transcriptionRunning: snapshot.running,
    transcriptionStopping: false,
    liveTranscriptText,
    liveTranscriptEntries,
    liveTranscriptionMode: snapshot.mode,
  };
  emit();
  syncLiveTranscriptionPolling();
  return snapshot;
}

function finalizeLiveTranscript(markDone = false) {
  const meeting = getRecordingMeeting();
  const entries = normalizeTranscriptEntries(state.liveTranscriptEntries);
  const mode = state.liveTranscriptionMode;

  if (!meeting) {
    patch({
      liveTranscriptText: "",
      liveTranscriptEntries: [],
      liveTranscriptionMode: null,
      recordingMeetingId: null,
      transcriptionStopping: false,
    });
    return null;
  }

  updateMeeting(meeting.id, (current) => {
    let transcript = current.transcript;

    if (entries.length > 0) {
      if (mode === "batch") {
        transcript = entries;
      } else if (!sameTranscriptEntries(current.transcript.slice(-entries.length), entries)) {
        transcript = [...current.transcript, ...entries];
      }
    }

    const transcriptChanged = transcript !== current.transcript;

    return {
      ...current,
      transcript,
      status: markDone ? "done" : current.status,
      summary: transcriptChanged ? null : current.summary,
      summaryProviderLabel: transcriptChanged ? null : current.summaryProviderLabel,
      summaryModel: transcriptChanged ? null : current.summaryModel,
      summaryUpdatedAt: transcriptChanged ? null : current.summaryUpdatedAt,
      updatedAt: new Date().toISOString(),
    };
  });

  patch({
    liveTranscriptText: "",
    liveTranscriptEntries: [],
    liveTranscriptionMode: null,
    recordingMeetingId: null,
    transcriptionStopping: false,
  });

  return meeting.id;
}

async function refreshLiveTranscription(silent = false) {
  const wasRunning = state.transcriptionRunning;
  const wasStopping = state.transcriptionStopping;

  try {
    const snapshot = await invoke<LiveTranscriptionState>("live_transcription_state");
    const liveTranscriptEntries = normalizeTranscriptEntries(snapshot.entries);
    const liveTranscriptText = transcriptEntriesToText(liveTranscriptEntries) || snapshot.text.trim();

    state = {
      ...state,
      transcriptionRunning: snapshot.running,
      transcriptionBusy: wasStopping ? snapshot.running : state.transcriptionBusy,
      transcriptionStopping: wasStopping && snapshot.running,
      liveTranscriptText,
      liveTranscriptEntries,
      liveTranscriptionMode: snapshot.mode,
      meetingNote: snapshot.error || state.meetingNote,
    };
    emit();

    if (wasRunning && !snapshot.running) {
      const endedMeetingId = finalizeLiveTranscript(true);
      if (endedMeetingId) {
        queueMeetingAutoDiarization(endedMeetingId);
      }
    }
  } catch (error) {
    if (!silent) {
      patch({ meetingNote: `Live transcription failed: ${String(error)}` });
    }
    patch({
      transcriptionBusy: false,
      transcriptionRunning: false,
      transcriptionStopping: false,
      liveTranscriptText: "",
      liveTranscriptEntries: [],
      liveTranscriptionMode: null,
    });
  } finally {
    syncLiveTranscriptionPolling();
  }
}

function waitForDelay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function waitForNextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function requestStopLiveTranscriptionSession() {
  const snapshot = await invoke<LiveTranscriptionState>("request_stop_live_transcription");
  const liveTranscriptEntries = normalizeTranscriptEntries(snapshot.entries);
  const liveTranscriptText = transcriptEntriesToText(liveTranscriptEntries) || snapshot.text.trim();

  const stopPending = snapshot.running;

  state = {
    ...state,
    transcriptionBusy: stopPending,
    transcriptionRunning: snapshot.running,
    transcriptionStopping: stopPending,
    liveTranscriptText,
    liveTranscriptEntries,
    liveTranscriptionMode: snapshot.mode,
    meetingNote: snapshot.error || state.meetingNote,
  };
  emit();

  if (!stopPending) {
    const endedMeetingId = finalizeLiveTranscript(true);
    if (endedMeetingId) {
      queueMeetingAutoDiarization(endedMeetingId);
    }
  }
  syncLiveTranscriptionPolling();
}

async function deleteMeetingExportQuietly(path: string | null) {
  const exportPath = path?.trim() || null;
  if (!exportPath) {
    return;
  }

  try {
    await invoke("delete_meeting_export", { path: exportPath });
  } catch {}
}

async function deleteMeetingAudioQuietly(path: string | null) {
  const audioPath = path?.trim() || null;
  if (!audioPath) {
    return;
  }

  try {
    await invoke("delete_meeting_audio", { path: audioPath });
  } catch {}
}

async function reconcilePersistedLiveMeetings() {
  const liveMeetings = sortedMeetings(
    state.meetings.filter((meeting) => meeting.status === "live"),
  );
  let snapshot: LiveTranscriptionState;

  try {
    snapshot = await invoke<LiveTranscriptionState>("live_transcription_state");
  } catch {
    return;
  }

  const activeMeetingId = snapshot.running ? liveMeetings[0]?.id ?? null : null;
  const nextLiveTranscriptEntries = normalizeTranscriptEntries(snapshot.entries);
  const nextLiveTranscriptText =
    transcriptEntriesToText(nextLiveTranscriptEntries) || snapshot.text.trim();
  const nextLiveTranscriptionMode = snapshot.mode;
  const nextMeetingNote = snapshot.error || state.meetingNote;
  const exportPathsToDelete: string[] = [];
  const finishedAt = new Date().toISOString();
  let meetingsChanged = false;

  const nextMeetings = state.meetings.flatMap((meeting) => {
    if (meeting.status !== "live") {
      return [meeting];
    }

    if (snapshot.running && meeting.id === activeMeetingId) {
      return [meeting];
    }

    meetingsChanged = true;

    if (isMeetingEmpty(meeting)) {
      const exportPath = meeting.exportPath?.trim();
      if (exportPath) {
        exportPathsToDelete.push(exportPath);
      }
      return [];
    }

    return [
      {
        ...meeting,
        status: "done" as const,
        updatedAt: finishedAt,
      },
    ];
  });

  const stateChanged =
    meetingsChanged ||
    state.recordingMeetingId !== activeMeetingId ||
    state.transcriptionRunning !== snapshot.running ||
    state.transcriptionStopping ||
    !sameTranscriptEntries(state.liveTranscriptEntries, nextLiveTranscriptEntries) ||
    state.liveTranscriptText !== nextLiveTranscriptText ||
    state.liveTranscriptionMode !== nextLiveTranscriptionMode ||
    state.meetingNote !== nextMeetingNote;

  if (stateChanged) {
    state = {
      ...state,
      meetings: nextMeetings,
      recordingMeetingId: activeMeetingId,
      transcriptionRunning: snapshot.running,
      transcriptionStopping: false,
      liveTranscriptText: nextLiveTranscriptText,
      liveTranscriptEntries: nextLiveTranscriptEntries,
      liveTranscriptionMode: nextLiveTranscriptionMode,
      meetingNote: nextMeetingNote,
    };
    if (meetingsChanged) {
      persistMeetings();
    }
    emit();
  }

  syncLiveTranscriptionPolling();
  await Promise.all(exportPathsToDelete.map((path) => deleteMeetingExportQuietly(path)));
}

async function waitForLiveTranscriptionStopCompletion() {
  while (state.transcriptionRunning) {
    await waitForDelay(LIVE_TRANSCRIPTION_STOP_WAIT_MS);
    await refreshLiveTranscription(true);
  }
}

async function stopActiveRecordingIfNeeded(nextMeetingId: string | null = null) {
  const activeMeeting = getRecordingMeeting();
  if (!activeMeeting || activeMeeting.id === nextMeetingId) {
    return;
  }

  await requestStopLiveTranscriptionSession();
  if (state.transcriptionRunning) {
    await waitForLiveTranscriptionStopCompletion();
  }
}

function setHashRoute(path: string) {
  window.location.hash = `#${path}`;
}

async function startMeeting() {
  if (state.startMeetingBusy) {
    return null;
  }

  patch({
    startMeetingBusy: true,
    permissionNote: "",
    meetingNote: "",
  });

  await waitForNextFrame();

  try {
    await ensureModelReady();
    await prepareMeetingPermissions();
    await stopActiveRecordingIfNeeded();
    patch({ transcriptionBusy: true });
    const meetingId = crypto.randomUUID();
    const snapshot = await startLiveTranscriptionSession(meetingId);
    const meeting = createMeeting(meetingId, snapshot.audioPath);
    return meeting;
  } catch (error) {
    patch({
      permissionNote: error instanceof Error ? error.message : String(error),
    });
    return null;
  } finally {
    patch({
      transcriptionBusy: false,
      startMeetingBusy: false,
    });
  }
}

async function toggleMeetingStatus(meetingId: string) {
  const meeting = getMeeting(meetingId);
  if (!meeting || state.transcriptionBusy) {
    return;
  }

  patch({
    transcriptionBusy: true,
    meetingNote: "",
  });

  try {
    if (meeting.status === "live") {
      if (!state.transcriptionRunning && state.recordingMeetingId !== meeting.id) {
        updateMeeting(meeting.id, (current) => ({
          ...current,
          status: "done",
          updatedAt: new Date().toISOString(),
        }));
        return;
      }

      if (state.recordingMeetingId !== meeting.id) {
        patch({ recordingMeetingId: meeting.id });
      }

      await requestStopLiveTranscriptionSession();
      return;
    }

    await ensureModelReady();
    await prepareMeetingPermissions();
    await stopActiveRecordingIfNeeded(meeting.id);
    const snapshot = await startLiveTranscriptionSession(meeting.id);
    updateMeeting(meeting.id, (current) => ({
      ...current,
      audioPath: snapshot.audioPath.trim() || current.audioPath,
      status: "live",
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    patch({
      meetingNote: error instanceof Error ? error.message : String(error),
    });
  } finally {
    if (!state.transcriptionStopping) {
      patch({ transcriptionBusy: false });
    }
  }
}

async function runMeetingDiarization(
  meetingId: string,
  options: { automatic?: boolean; speakerCount?: number | null } = {},
) {
  const meeting = getMeeting(meetingId);
  if (!meeting || state.diarizationRunBusy) {
    return;
  }

  patch({
    diarizationRunBusy: true,
    meetingNote: "",
  });

  try {
    await ensureDiarizationReady();
    const speakerCount =
      options.speakerCount !== undefined ? options.speakerCount : meeting.requestedSpeakerCount;

    const result = await invoke<LocalDiarizationResult>("run_local_diarization", {
      input: {
        audioPath: meeting.audioPath.trim(),
        speakerCount,
      },
    });

    updateMeeting(meetingId, (current) => ({
      ...current,
      audioPath: result.audioPath,
      diarizationSegments: result.segments,
      diarizationSpeakerCount: result.speakerCount,
      diarizationPipelineSource: result.pipelineSource,
      diarizationRanAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    patch({
      meetingNote:
        result.segments.length === 0
          ? options.automatic
            ? "Auto-diarization finished, but no speaker turns were detected."
            : "Diarization finished, but no speaker turns were detected."
          : options.automatic
            ? `Auto-diarized ${result.speakerCount} speakers across ${result.segments.length} segments.`
            : `Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`,
    });
  } catch (error) {
    patch({
      meetingNote:
        error instanceof Error
          ? options.automatic
            ? `Auto-diarization failed: ${error.message}`
            : error.message
          : String(error),
    });
  } finally {
    patch({ diarizationRunBusy: false });
    void drainAutoDiarizationQueue();
  }
}

async function revealMeetingExportInFinder(meetingId: string) {
  const meeting = getMeeting(meetingId);
  if (!meeting) {
    return;
  }

  patch({ permissionNote: "" });

  try {
    const path = await syncMeetingMarkdown(meetingId, { force: true });
    if (!path) {
      throw new Error("Failed to resolve the meeting export.");
    }

    await invoke("reveal_meeting_export_in_finder", { path });
  } catch (error) {
    patch({
      permissionNote: error instanceof Error ? error.message : String(error),
    });
  }
}

async function deleteMeeting(meetingId: string) {
  const meeting = getMeeting(meetingId);
  const activeMeetingRunning =
    state.recordingMeetingId === meetingId || (meeting?.status === "live" && state.transcriptionRunning);
  if (
    !meeting ||
    state.transcriptionBusy ||
    activeMeetingRunning
  ) {
    return;
  }

  const exportPath = meeting.exportPath?.trim() || null;
  const audioPath = meeting.audioPath?.trim() || null;
  const deletedActiveMeeting = currentMeetingIdFromHash() === meetingId;

  clearMeetingMarkdownSync(meetingId);

  state = {
    ...state,
    meetings: state.meetings.filter((candidate) => candidate.id !== meetingId),
    permissionNote: "",
    meetingNote: deletedActiveMeeting ? "" : state.meetingNote,
  };
  persistMeetings();
  emit();

  if (deletedActiveMeeting) {
    setHashRoute("/");
  }

  if (!exportPath && !audioPath) {
    return;
  }

  try {
    await Promise.all([
      deleteMeetingExportQuietly(exportPath),
      deleteMeetingAudioQuietly(audioPath),
    ]);
  } catch (error) {
    patch({
      permissionNote:
        error instanceof Error
          ? `Deleted the meeting, but couldn't remove one of its local files: ${error.message}`
          : `Deleted the meeting, but couldn't remove one of its local files: ${String(error)}`,
    });
  }
}

async function saveGeneralSettings() {
  if (state.generalBusy) {
    return;
  }

  patch({
    generalBusy: true,
    generalNote: "",
  });

  const mainLanguage = normalizeLanguageCode(state.generalDraft.mainLanguage) || defaultMainLanguage();
  const spokenLanguages = normalizeSpokenLanguages(
    state.generalDraft.spokenLanguages,
    mainLanguage,
  );

  try {
    const generalSettings = await invoke<GeneralSettings>("save_general_settings", {
      settings: {
        mainLanguage,
        spokenLanguages,
        timezone: state.generalDraft.timezone.trim(),
      },
    });

    patch({
      generalSettings,
      generalDraft: syncGeneralDraft(generalSettings),
      generalNote: "",
    });
    await refreshModelSettings(true);
  } catch (error) {
    patch({
      generalNote: `Settings save failed: ${String(error)}`,
    });
  } finally {
    patch({ generalBusy: false });
  }
}

async function saveModelSettings(
  next: Partial<Pick<ModelSettings, "processingMode" | "batchModelId">> = {},
) {
  if (state.modelBusy || !state.modelSettings) {
    return;
  }

  patch({
    modelBusy: true,
    permissionNote: "",
  });

  try {
    const modelSettings = await invoke<ModelSettings>("save_model_settings", {
      settings: {
        processingMode: next.processingMode ?? state.modelSettings.processingMode,
        batchModelId: next.batchModelId ?? state.modelSettings.batchModelId,
      },
    });

    patch({ modelSettings });
    await Promise.all([refreshManagedModelDownloadState(true), refreshPermissions(true)]);
  } catch (error) {
    patch({
      permissionNote:
        error instanceof Error ? error.message : `Model settings save failed: ${String(error)}`,
    });
  } finally {
    patch({ modelBusy: false });
  }
}

async function saveSummarySettings(options?: { clearApiKey?: boolean }) {
  if (state.summaryBusy) {
    return;
  }

  patch({
    summaryBusy: true,
    summaryNote: "",
  });

  try {
    const summarySettings = await invoke<SummarySettings>("save_summary_settings", {
      settings: {
        provider: state.summaryDraft.provider.trim(),
        model: state.summaryDraft.model.trim(),
        baseUrl: state.summaryDraft.baseUrl.trim(),
        apiKey: state.summaryDraft.apiKey.trim(),
        updateApiKey: state.summaryDraft.apiKeyDirty && state.summaryDraft.apiKey.trim().length > 0,
        clearApiKey: options?.clearApiKey === true,
      },
    });

    patch({
      summarySettings,
      summaryDraft: syncSummaryDraft(summarySettings),
      summaryNote: "",
    });
  } catch (error) {
    patch({
      summaryNote: `Summary settings save failed: ${String(error)}`,
    });
  } finally {
    patch({ summaryBusy: false });
  }
}

async function startManagedModelDownload() {
  if (state.modelBusy) {
    return;
  }

  const pendingDownload = optimisticModelDownloadState();
  modelDownloadStartDeadline = Date.now() + MODEL_DOWNLOAD_START_GRACE_MS;

  patch({
    modelBusy: true,
    permissionNote: "",
    modelDownload: pendingDownload,
  });
  syncModelDownloadPolling();

  try {
    const modelDownload = await invoke<ManagedModelDownloadState>("download_managed_model");
    patch({
      modelDownload:
        modelDownload.status === "idle" && modelDownloadStartPending() ? pendingDownload : modelDownload,
    });
    syncModelDownloadPolling();
    await Promise.all([refreshManagedModelDownloadState(true), refreshModelSettings(true)]);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Model download failed: ${String(error)}`;
    modelDownloadStartDeadline = 0;
    patch({
      modelDownload: {
        ...pendingDownload,
        status: "error",
        currentFile: null,
        error: message,
      },
      permissionNote: "",
    });
  } finally {
    patch({ modelBusy: false });
  }
}

function handleAppFocus() {
  if (isSettingsWindow) {
    void refreshSettingsWindowData(true);
    return;
  }

  void Promise.all([
    refreshGeneralSettings(true),
    refreshSummarySettings(true),
    refreshPermissions(true),
    refreshManagedModelDownloadState(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]);
}

async function handleShortcutStartMeeting() {
  if (requiresAppSetup(state)) {
    const content = currentSetupBannerContent(state);
    patch({
      permissionNote: content?.copy ?? "This build is missing required transcription files.",
    });
    return;
  }

  const meeting = await startMeeting();
  if (meeting) {
    setHashRoute(`/meeting/${meeting.id}`);
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }

  if (isSettingsWindow) {
    if (
      event.key !== "Escape" ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    event.preventDefault();
    void currentWindow.hide();
    return;
  }

  if (event.altKey || event.shiftKey || event.key.toLowerCase() !== "n") {
    return;
  }

  const usesPrimaryModifier = isMacLike
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!usesPrimaryModifier) {
    return;
  }

  event.preventDefault();
  void handleShortcutStartMeeting();
}

function updateMeetingTitle(meetingId: string, nextTitle: string) {
  const title = normalizeMeetingTitle(nextTitle);
  const currentMeeting = getMeeting(meetingId);
  if (!currentMeeting || !title || title === currentMeeting.title) {
    return;
  }

  updateMeeting(meetingId, (meeting) => ({
    ...meeting,
    title,
    updatedAt: new Date().toISOString(),
  }));
}

function updateMeetingAudioPath(meetingId: string, audioPath: string) {
  updateMeeting(meetingId, (meeting) => ({
    ...meeting,
    audioPath,
    updatedAt: meeting.updatedAt,
  }));
}

function updateMeetingRequestedSpeakerCount(meetingId: string, value: string) {
  const trimmed = value.trim();
  const requestedSpeakerCount =
    trimmed.length === 0 ? null : normalizeRequestedSpeakerCount(Number.parseInt(trimmed, 10));

  updateMeeting(meetingId, (meeting) => ({
    ...meeting,
    requestedSpeakerCount,
    updatedAt: meeting.updatedAt,
  }));
}

function setHomeScrollTop(homeScrollTop: number) {
  patch({ homeScrollTop });
}

function setProcessingMode(processingMode: ProcessingMode) {
  if (!state.modelSettings || state.modelSettings.processingMode === processingMode) {
    return;
  }

  void saveModelSettings({ processingMode });
}

function setBatchModel(batchModelId: SpeechModelId) {
  if (!state.modelSettings || state.modelSettings.batchModelId === batchModelId) {
    return;
  }

  void saveModelSettings({ batchModelId });
}

function setMainLanguage(mainLanguage: string) {
  const nextMainLanguage = normalizeLanguageCode(mainLanguage) || defaultMainLanguage();
  patch({
    generalDraft: {
      ...state.generalDraft,
      mainLanguage: nextMainLanguage,
      spokenLanguages: normalizeSpokenLanguages(
        state.generalDraft.spokenLanguages,
        nextMainLanguage,
      ),
    },
    generalNote: "",
  });
  void saveGeneralSettings();
}

function setTimezone(timezone: string) {
  patch({
    generalDraft: {
      ...state.generalDraft,
      timezone: timezone.trim(),
    },
    generalNote: "",
  });
  void saveGeneralSettings();
}

function addSpokenLanguage(language: string) {
  const nextLanguage = normalizeLanguageCode(language);
  if (!nextLanguage) {
    return;
  }

  patch({
    generalDraft: {
      ...state.generalDraft,
      spokenLanguages: normalizeSpokenLanguages(
        [...state.generalDraft.spokenLanguages, nextLanguage],
        state.generalDraft.mainLanguage,
      ),
    },
    generalNote: "",
  });
  void saveGeneralSettings();
}

function removeSpokenLanguage(language: string) {
  patch({
    generalDraft: {
      ...state.generalDraft,
      spokenLanguages: state.generalDraft.spokenLanguages.filter((value) => value !== language),
    },
    generalNote: "",
  });
  void saveGeneralSettings();
}

function setSummaryProvider(provider: string) {
  const nextProvider = provider.trim();
  const restoreSaved = state.summarySettings?.provider === nextProvider;

  patch({
    summaryDraft: {
      provider: nextProvider,
      model: restoreSaved ? state.summarySettings?.model ?? "" : "",
      baseUrl: restoreSaved ? state.summarySettings?.baseUrl ?? "" : "",
      apiKey: "",
      apiKeyDirty: false,
      apiKeyPresent: restoreSaved ? Boolean(state.summarySettings?.apiKeyPresent) : false,
    },
    summaryNote: "",
  });
}

function setSummaryModel(model: string) {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      model,
    },
    summaryNote: "",
  });
}

function setSummaryBaseUrl(baseUrl: string) {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      baseUrl,
    },
    summaryNote: "",
  });
}

function setSummaryApiKey(apiKey: string) {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      apiKey,
      apiKeyDirty: true,
      apiKeyPresent: state.summaryDraft.apiKeyPresent,
    },
    summaryNote: "",
  });
}

async function removeSummaryApiKey() {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      apiKey: "",
      apiKeyDirty: false,
      apiKeyPresent: false,
    },
    summaryNote: "",
  });
  await saveSummarySettings({ clearApiKey: true });
}

async function openSettingsWindow() {
  try {
    await invoke("open_settings_window");
  } catch (error) {
    patch({
      meetingNote:
        error instanceof Error ? error.message : `Could not open preferences: ${String(error)}`,
    });
  }
}

async function generateMeetingSummary(meetingId: string) {
  const meeting = getMeeting(meetingId);
  if (!meeting || state.summaryMeetingId) {
    return;
  }

  const transcript = getMeetingTranscriptLines(meeting).join("\n\n").trim();
  if (!transcript) {
    patch({ meetingNote: "Add some transcript before generating a summary." });
    return;
  }

  patch({
    summaryMeetingId: meetingId,
    meetingNote: "",
  });

  try {
    const language = normalizeLanguageCode(state.generalDraft.mainLanguage) || defaultMainLanguage();
    const result = await invoke<GeneratedTranscriptSummary>("generate_transcript_summary", {
      input: {
        title: meeting.title,
        transcript,
        language,
      },
    });
    const summaryUpdatedAt = new Date().toISOString();

    updateMeeting(meetingId, (current) => ({
      ...current,
      summary: result.summary,
      summaryProviderLabel: result.providerLabel,
      summaryModel: result.model,
      summaryUpdatedAt,
      updatedAt: summaryUpdatedAt,
    }));

    patch({
      meetingNote: `Summary created with ${result.providerLabel}.`,
    });
  } catch (error) {
    patch({
      meetingNote:
        error instanceof Error ? error.message : `Summary generation failed: ${String(error)}`,
    });
  } finally {
    patch({ summaryMeetingId: null });
  }
}

function getMeetingById(meetingId: string) {
  return getMeeting(meetingId);
}

async function start() {
  if (started) {
    return;
  }

  started = true;
  document.body.dataset.meetingOverlay = "on";
  window.addEventListener("keydown", handleWindowKeydown);

  if (isSettingsWindow) {
    await refreshSettingsWindowData(false);
    patch({ initialized: true });
    return;
  }

  await reconcilePersistedLiveMeetings();
  queueLoadedMeetingMarkdownSync();
  window.addEventListener("focus", handleAppFocus);
  await Promise.all([
    refreshGeneralSettings(true),
    refreshSummarySettings(true),
    refreshPermissions(true),
    refreshManagedModelDownloadState(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]);
  patch({ initialized: true });
}

export const appStore = {
  subscribe,
  getSnapshot,
  start,
  startMeeting,
  toggleMeetingStatus,
  runMeetingDiarization,
  revealMeetingExportInFinder,
  deleteMeeting,
  startManagedModelDownload,
  updateMeetingTitle,
  updateMeetingAudioPath,
  updateMeetingRequestedSpeakerCount,
  setHomeScrollTop,
  setProcessingMode,
  setBatchModel,
  setMainLanguage,
  setTimezone,
  addSpokenLanguage,
  removeSpokenLanguage,
  setSummaryProvider,
  setSummaryModel,
  setSummaryBaseUrl,
  setSummaryApiKey,
  saveSummarySettings,
  removeSummaryApiKey,
  openSettingsWindow,
  refreshSettingsWindowData,
  generateMeetingSummary,
  getMeetingById,
};
