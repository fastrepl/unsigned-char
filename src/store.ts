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
  bundleIdentifier: string;
  engine: string;
  reference: string;
  permissions: Record<PermissionKind, PermissionStatus>;
  ready: boolean;
  runningInsideAppBundle: boolean;
  permissionHostIdentifier: string | null;
  permissionHostMatchesBundleIdentifier: boolean;
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
  audioSavedAt: string | null;
  requestedSpeakerCount: number | null;
  diarizationSegments: DiarizationSegment[];
  speakerLabels: Record<string, string>;
  speakerSuggestions: Record<string, SpeakerSuggestion>;
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
  progressPercent: number | null;
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

export type AudioRetentionPolicy =
  | "none"
  | "oneDay"
  | "threeDays"
  | "oneWeek"
  | "oneMonth";

export type GeneralSettings = {
  mainLanguage: string;
  spokenLanguages: string[];
  timezone: string;
  audioRetention: AudioRetentionPolicy;
};

export type AudioDevice = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type AudioDeviceSettings = {
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
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

export type SpeakerProfileSample = {
  id: string;
  audioPath: string;
  startSeconds: number;
  endSeconds: number;
  addedAt: string;
  meetingId: string | null;
  sourceSpeaker: string | null;
  embedding: number[];
};

export type SpeakerProfile = {
  id: string;
  name: string;
  updatedAt: string;
  centroidEmbedding: number[];
  samples: SpeakerProfileSample[];
};

export type SpeakerSuggestion = {
  profileId: string;
  profileName: string;
  confidence: number;
  alternateConfidence: number;
};

type LocalDiarizationResult = {
  audioPath: string;
  pipelineSource: string;
  speakerCount: number;
  segments: DiarizationSegment[];
};

type SpeakerEmbeddingAnalysisInput = {
  audioPath: string;
  speakers: {
    speaker: string;
    segments: DiarizationSegment[];
  }[];
};

type SpeakerEmbeddingAnalysisSample = {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  embedding: number[];
};

type SpeakerEmbeddingAnalysis = {
  speaker: string;
  embedding: number[];
  samples: SpeakerEmbeddingAnalysisSample[];
};

type SpeakerEmbeddingAnalysisResult = {
  speakers: SpeakerEmbeddingAnalysis[];
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
  audioDeviceSettings: AudioDeviceSettings | null;
  generalDraft: GeneralDraft;
  summarySettings: SummarySettings | null;
  summaryDraft: SummaryDraft;
  speakerProfiles: SpeakerProfile[];
  meetings: Meeting[];
  permissionNote: string;
  generalNote: string;
  summaryNote: string;
  speakerProfilesNote: string;
  modelBusy: boolean;
  generalBusy: boolean;
  audioDeviceRefreshBusy: boolean;
  summaryBusy: boolean;
  speakerProfilesBusy: boolean;
  startMeetingBusy: boolean;
  transcriptionBusy: boolean;
  transcriptionStopping: boolean;
  transcriptionRunning: boolean;
  liveTranscriptText: string;
  liveTranscriptEntries: TranscriptEntry[];
  liveTranscriptionMode: ProcessingMode | null;
  recordingMeetingId: string | null;
  diarizationRunBusy: boolean;
  diarizationMeetingId: string | null;
  diarizationIndicatorMinimized: boolean;
  diarizationBannerMessage: string | null;
  summaryMeetingId: string | null;
  meetingNote: string;
  homeScrollTop: number;
};

type SetupBannerContent = {
  kicker: string;
  title: string;
  copy: string;
  detail: string;
  actionLabel: string | null;
  secondaryActionLabel: string | null;
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
const SUMMARY_AUTOSAVE_MS = 500;
const MARKDOWN_SAVE_ERROR_PREFIX = "Markdown save failed:";
const liveTranscriptionPermissionKinds: PermissionKind[] = ["microphone", "systemAudio"];
type PendingAutoDiarization = {
  meetingId: string;
  speakerCount: number | null;
};

const pendingAutoDiarizationRuns: PendingAutoDiarization[] = [];
let autoDiarizationDrainRunning = false;
let modelDownloadStartDeadline = 0;
let summaryAutosaveTimer: number | null = null;

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
  audioDeviceSettings: null,
  generalDraft: emptyGeneralDraft(),
  summarySettings: null,
  summaryDraft: emptySummaryDraft(),
  speakerProfiles: [],
  meetings: loadMeetings(),
  permissionNote: "",
  generalNote: "",
  summaryNote: "",
  speakerProfilesNote: "",
  modelBusy: false,
  generalBusy: false,
  audioDeviceRefreshBusy: false,
  summaryBusy: false,
  speakerProfilesBusy: false,
  startMeetingBusy: false,
  transcriptionBusy: false,
  transcriptionStopping: false,
  transcriptionRunning: false,
  liveTranscriptText: "",
  liveTranscriptEntries: [],
  liveTranscriptionMode: null,
  recordingMeetingId: null,
  diarizationRunBusy: false,
  diarizationMeetingId: null,
  diarizationIndicatorMinimized: false,
  diarizationBannerMessage: null,
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

function setDiarizationIndicatorMinimized(minimized: boolean) {
  if (!state.diarizationRunBusy || !state.diarizationMeetingId) {
    return;
  }

  patch({ diarizationIndicatorMinimized: minimized });
}

function dismissDiarizationBanner(meetingId?: string | null) {
  if (meetingId && state.diarizationMeetingId !== meetingId) {
    return;
  }

  patch({
    diarizationMeetingId: null,
    diarizationIndicatorMinimized: false,
    diarizationBannerMessage: null,
  });
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
    audioRetention: "oneMonth",
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
    audioRetention: settings.audioRetention,
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
    audioSavedAt:
      typeof candidate.audioSavedAt === "string" && candidate.audioSavedAt.length > 0
        ? candidate.audioSavedAt
        : typeof candidate.audioPath === "string" && candidate.audioPath.trim().length > 0
          ? candidate.updatedAt
          : null,
    requestedSpeakerCount: normalizeRequestedSpeakerCount(candidate.requestedSpeakerCount),
    diarizationSegments,
    speakerLabels: normalizeSpeakerLabels(candidate.speakerLabels),
    speakerSuggestions: normalizeSpeakerSuggestions(candidate.speakerSuggestions),
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

function transcriptWordPairs(text: string) {
  return collapseRepeatedTranscriptSpans(text)
    .split(/\s+/)
    .map((word) => ({
      word,
      token: normalizeTranscriptComparisonText(word),
    }))
    .filter((pair) => pair.word && pair.token);
}

function transcriptWords(text: string) {
  return transcriptWordPairs(text).map((pair) => pair.word);
}

function tokenCharacterLength(tokens: string[]) {
  return tokens.join("").length;
}

function commonPrefixLength(left: string[], right: string[]) {
  const overlap = Math.min(left.length, right.length);
  let length = 0;

  while (length < overlap && left[length] === right[length]) {
    length += 1;
  }

  return length;
}

function commonSuffixLength(left: string[], right: string[]) {
  const overlap = Math.min(left.length, right.length);
  let length = 0;

  while (
    length < overlap &&
    left[left.length - 1 - length] === right[right.length - 1 - length]
  ) {
    length += 1;
  }

  return length;
}

function suffixPrefixOverlapLength(left: string[], right: string[]) {
  const overlap = Math.min(left.length, right.length);

  for (let size = overlap; size >= 1; size -= 1) {
    let matches = true;

    for (let index = 0; index < size; index += 1) {
      if (left[left.length - size + index] !== right[index]) {
        matches = false;
        break;
      }
    }

    if (matches) {
      return size;
    }
  }

  return 0;
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

function longestCommonTokenSpanLength(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const previous = new Array<number>(right.length + 1).fill(0);
  const current = new Array<number>(right.length + 1).fill(0);
  let longest = 0;

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        current[rightIndex] = previous[rightIndex - 1] + 1;
        longest = Math.max(longest, current[rightIndex]);
      } else {
        current[rightIndex] = 0;
      }
    }

    previous.splice(0, previous.length, ...current);
    current.fill(0);
  }

  return longest;
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
  const lcsLength = longestCommonSubsequenceLength(leftTokens, rightTokens);
  const contiguousSpanLength = longestCommonTokenSpanLength(leftTokens, rightTokens);

  if (shorterLength < 6 || shorterLength / longerLength < 0.82) {
    return (
      shorterLength >= 6 &&
      contiguousSpanLength >= 8 &&
      lcsLength / shorterLength >= 0.68 &&
      contiguousSpanLength / shorterLength >= 0.55
    );
  }

  if (lcsLength / longerLength >= 0.88) {
    return true;
  }

  return lcsLength / shorterLength >= 0.78 && contiguousSpanLength / shorterLength >= 0.55;
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
  const preferredSource = left.source;

  if (Math.abs(leftLength - rightLength) <= 2) {
    if (left.source === "system" && right.source !== "system") {
      return left;
    }

    if (right.source === "system" && left.source !== "system") {
      return {
        ...right,
        source: preferredSource,
      };
    }
  }

  if (rightLength >= leftLength * 1.2) {
    return {
      ...right,
      source: preferredSource,
    };
  }

  return left;
}

const TRANSCRIPT_SHARED_EDGE_MIN_TOKENS = 5;
const TRANSCRIPT_SHARED_EDGE_MIN_CHARACTERS = 20;
const TRANSCRIPT_SHARED_EDGE_MIN_REMAINDER_TOKENS = 4;
const TRANSCRIPT_SHARED_EDGE_MIN_REMAINDER_CHARACTERS = 14;

function isMeaningfulSharedTranscriptEdge(tokens: string[]) {
  return (
    tokens.length >= TRANSCRIPT_SHARED_EDGE_MIN_TOKENS &&
    tokenCharacterLength(tokens) >= TRANSCRIPT_SHARED_EDGE_MIN_CHARACTERS
  );
}

function hasMeaningfulTranscriptRemainder(tokens: string[]) {
  return (
    tokens.length >= TRANSCRIPT_SHARED_EDGE_MIN_REMAINDER_TOKENS ||
    tokenCharacterLength(tokens) >= TRANSCRIPT_SHARED_EDGE_MIN_REMAINDER_CHARACTERS
  );
}

function trimTranscriptEntryTokens(
  entry: TranscriptEntry,
  startTrim: number,
  endTrim: number,
) {
  if (startTrim <= 0 && endTrim <= 0) {
    return entry;
  }

  const words = transcriptWords(entry.text);
  const start = Math.min(Math.max(0, startTrim), words.length);
  const end = Math.max(start, words.length - Math.max(0, endTrim));
  const trimmedWords = words.slice(start, end);

  if (trimmedWords.length === words.length) {
    return entry;
  }

  return createTranscriptEntry(trimmedWords.join(" "), entry.source);
}

function trimSharedSystemTranscriptEdges(left: TranscriptEntry, right: TranscriptEntry) {
  if (left.source !== "system" && right.source !== "system") {
    return { left, right };
  }

  const trimMicrophoneEdges = (microphone: TranscriptEntry, system: TranscriptEntry) => {
    const microphoneTokens = transcriptWordPairs(microphone.text).map((pair) => pair.token);
    const systemTokens = transcriptWordPairs(system.text).map((pair) => pair.token);

    if (
      microphoneTokens.length === 0 ||
      systemTokens.length === 0 ||
      !hasMeaningfulTranscriptRemainder(microphoneTokens)
    ) {
      return microphone;
    }

    const prefixTrim = Math.max(
      commonPrefixLength(microphoneTokens, systemTokens),
      suffixPrefixOverlapLength(systemTokens, microphoneTokens),
    );
    const shouldTrimPrefix =
      isMeaningfulSharedTranscriptEdge(microphoneTokens.slice(0, prefixTrim)) &&
      hasMeaningfulTranscriptRemainder(microphoneTokens.slice(prefixTrim));

    const suffixTrim = Math.max(
      suffixPrefixOverlapLength(microphoneTokens, systemTokens),
      commonSuffixLength(microphoneTokens, systemTokens),
    );
    const suffixStart = Math.max(0, microphoneTokens.length - suffixTrim);
    const shouldTrimSuffix =
      isMeaningfulSharedTranscriptEdge(microphoneTokens.slice(suffixStart)) &&
      hasMeaningfulTranscriptRemainder(microphoneTokens.slice(0, suffixStart));

    return (
      trimTranscriptEntryTokens(
        microphone,
        shouldTrimPrefix ? prefixTrim : 0,
        shouldTrimSuffix ? suffixTrim : 0,
      ) ?? null
    );
  };

  if (left.source === "microphone" && right.source === "system") {
    return {
      left: trimMicrophoneEdges(left, right),
      right,
    };
  }

  if (left.source === "system" && right.source === "microphone") {
    return {
      left,
      right: trimMicrophoneEdges(right, left),
    };
  }

  return { left, right };
}

function compactTranscriptEntries(entries: TranscriptEntry[]) {
  const compacted: TranscriptEntry[] = [];

  for (const entry of entries) {
    const text = collapseRepeatedTranscriptSpans(entry.text);
    let candidate = createTranscriptEntry(text, entry.source);
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

      const trimmed = trimSharedSystemTranscriptEdges(existing, candidate);
      if (trimmed.left !== existing) {
        if (trimmed.left) {
          compacted[index] = trimmed.left;
        } else {
          compacted.splice(index, 1);
        }
      }
      if (!trimmed.right) {
        merged = true;
        candidate = null;
        break;
      }

      candidate = trimmed.right;
      const nextExisting = trimmed.left ?? null;
      if (!nextExisting) {
        continue;
      }

      if (!transcriptEntriesCloselyMatchAcrossSources(nextExisting, candidate)) {
        continue;
      }

      compacted[index] = preferredCrossSourceTranscriptEntry(nextExisting, candidate);
      merged = true;
      candidate = null;
      break;
    }

    if (!candidate) {
      continue;
    }

    const nextLastEntry = compacted[compacted.length - 1];
    if (nextLastEntry && nextLastEntry.source === candidate.source) {
      if (transcriptEntriesSubstantiallyOverlap(nextLastEntry, candidate)) {
        compacted[compacted.length - 1] = preferredTranscriptEntry(nextLastEntry, candidate);
        continue;
      }
    }

    if (!merged) {
      compacted.push(candidate);
    }
  }

  return compacted;
}

function mergeTranscriptEntries(...groups: TranscriptEntry[][]) {
  return compactTranscriptEntries(groups.flat());
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

function normalizeSpeakerId(value: string) {
  return value.trim();
}

function normalizeSpeakerLabel(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function defaultSpeakerLabelForId(speaker: string) {
  const normalizedSpeaker = normalizeSpeakerId(speaker);

  if (!normalizedSpeaker) {
    return "Speaker";
  }

  const generatedSpeakerMatch = normalizedSpeaker.match(/^speaker[_-]?0*([0-9]+)$/i);
  if (generatedSpeakerMatch) {
    return `Speaker ${Number.parseInt(generatedSpeakerMatch[1], 10) + 1}`;
  }

  if (/^mic(rophone)?$/i.test(normalizedSpeaker)) {
    return "Mic";
  }

  return normalizedSpeaker;
}

function normalizeSpeakerLabels(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, string>>(
    (speakerLabels, [speaker, label]) => {
      if (typeof label !== "string") {
        return speakerLabels;
      }

      const normalizedSpeaker = normalizeSpeakerId(speaker);
      const normalizedLabel = normalizeSpeakerLabel(label);
      if (!normalizedSpeaker || !normalizedLabel) {
        return speakerLabels;
      }

      if (normalizedLabel === defaultSpeakerLabelForId(normalizedSpeaker)) {
        return speakerLabels;
      }

      speakerLabels[normalizedSpeaker] = normalizedLabel;
      return speakerLabels;
    },
    {},
  );
}

function normalizeEmbedding(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) =>
    typeof entry === "number" && Number.isFinite(entry) ? [entry] : [],
  );
}

function normalizeSpeakerSuggestions(value: unknown) {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.entries(value as Record<string, unknown>).reduce<Record<string, SpeakerSuggestion>>(
    (speakerSuggestions, [speaker, suggestion]) => {
      if (!suggestion || typeof suggestion !== "object") {
        return speakerSuggestions;
      }

      const candidate = suggestion as Record<string, unknown>;
      if (
        typeof candidate.profileId !== "string" ||
        typeof candidate.profileName !== "string" ||
        typeof candidate.confidence !== "number" ||
        typeof candidate.alternateConfidence !== "number" ||
        !Number.isFinite(candidate.confidence) ||
        !Number.isFinite(candidate.alternateConfidence)
      ) {
        return speakerSuggestions;
      }

      const normalizedSpeaker = normalizeSpeakerId(speaker);
      if (!normalizedSpeaker) {
        return speakerSuggestions;
      }

      speakerSuggestions[normalizedSpeaker] = {
        profileId: candidate.profileId,
        profileName: normalizeSpeakerLabel(candidate.profileName),
        confidence: candidate.confidence,
        alternateConfidence: candidate.alternateConfidence,
      };
      return speakerSuggestions;
    },
    {},
  );
}

function normalizeSpeakerProfileSample(value: unknown): SpeakerProfileSample | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" ||
    typeof candidate.audioPath !== "string" ||
    typeof candidate.startSeconds !== "number" ||
    typeof candidate.endSeconds !== "number" ||
    !Number.isFinite(candidate.startSeconds) ||
    !Number.isFinite(candidate.endSeconds) ||
    candidate.endSeconds <= candidate.startSeconds
  ) {
    return null;
  }

  const embedding = normalizeEmbedding(candidate.embedding);
  if (embedding.length === 0) {
    return null;
  }

  return {
    id: candidate.id,
    audioPath: candidate.audioPath,
    startSeconds: candidate.startSeconds,
    endSeconds: candidate.endSeconds,
    addedAt: typeof candidate.addedAt === "string" ? candidate.addedAt : "",
    meetingId: typeof candidate.meetingId === "string" && candidate.meetingId.trim() ? candidate.meetingId : null,
    sourceSpeaker:
      typeof candidate.sourceSpeaker === "string" && candidate.sourceSpeaker.trim()
        ? normalizeSpeakerId(candidate.sourceSpeaker)
        : null,
    embedding,
  };
}

function normalizeSpeakerProfile(value: unknown): SpeakerProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    return null;
  }

  const name = normalizeSpeakerLabel(candidate.name);
  if (!name) {
    return null;
  }

  return {
    id: candidate.id,
    name,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : "",
    centroidEmbedding: normalizeEmbedding(candidate.centroidEmbedding),
    samples: Array.isArray(candidate.samples)
      ? candidate.samples
          .map(normalizeSpeakerProfileSample)
          .filter((sample): sample is SpeakerProfileSample => sample !== null)
      : [],
  };
}

function normalizeSpeakerProfiles(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(normalizeSpeakerProfile)
    .filter((profile): profile is SpeakerProfile => profile !== null);
}

function normalizeSpeakerEmbeddingAnalysisSample(value: unknown): SpeakerEmbeddingAnalysisSample | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.startSeconds !== "number" ||
    typeof candidate.endSeconds !== "number" ||
    typeof candidate.durationSeconds !== "number" ||
    !Number.isFinite(candidate.startSeconds) ||
    !Number.isFinite(candidate.endSeconds) ||
    !Number.isFinite(candidate.durationSeconds)
  ) {
    return null;
  }

  const embedding = normalizeEmbedding(candidate.embedding);
  if (embedding.length === 0) {
    return null;
  }

  return {
    startSeconds: candidate.startSeconds,
    endSeconds: candidate.endSeconds,
    durationSeconds: candidate.durationSeconds,
    embedding,
  };
}

function normalizeSpeakerEmbeddingAnalysis(value: unknown): SpeakerEmbeddingAnalysis | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.speaker !== "string") {
    return null;
  }

  return {
    speaker: normalizeSpeakerId(candidate.speaker),
    embedding: normalizeEmbedding(candidate.embedding),
    samples: Array.isArray(candidate.samples)
      ? candidate.samples
          .map(normalizeSpeakerEmbeddingAnalysisSample)
          .filter((sample): sample is SpeakerEmbeddingAnalysisSample => sample !== null)
      : [],
  };
}

function normalizeSpeakerEmbeddingAnalysisResult(value: unknown): SpeakerEmbeddingAnalysisResult {
  if (!value || typeof value !== "object") {
    return { speakers: [] };
  }

  const candidate = value as Record<string, unknown>;
  return {
    speakers: Array.isArray(candidate.speakers)
      ? candidate.speakers
          .map(normalizeSpeakerEmbeddingAnalysis)
          .filter((speaker): speaker is SpeakerEmbeddingAnalysis => speaker !== null)
      : [],
  };
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

function speakerProfileNameKey(name: string) {
  return normalizeSpeakerLabel(name).toLocaleLowerCase();
}

function cosineSimilarity(left: number[], right: number[]) {
  if (left.length === 0 || left.length !== right.length) {
    return 0;
  }

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] * left[index];
    rightNorm += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftNorm) * Math.sqrt(rightNorm);
  return denominator > 0 ? dot / denominator : 0;
}

function normalizedEmbeddingCentroid(embeddings: number[][]) {
  const [first] = embeddings;
  if (!first || first.length === 0) {
    return [];
  }

  const centroid = new Array(first.length).fill(0);
  for (const embedding of embeddings) {
    if (embedding.length !== centroid.length) {
      continue;
    }

    for (let index = 0; index < centroid.length; index += 1) {
      centroid[index] += embedding[index];
    }
  }

  const norm = Math.sqrt(centroid.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    return centroid;
  }

  return centroid.map((value) => value / norm);
}

function speakerSampleSignature(sample: Pick<SpeakerProfileSample, "audioPath" | "startSeconds" | "endSeconds">) {
  return `${sample.audioPath}::${sample.startSeconds.toFixed(3)}::${sample.endSeconds.toFixed(3)}`;
}

function prepareSpeakerProfilesForSave(profiles: SpeakerProfile[]) {
  return profiles.flatMap((profile) => {
    const name = normalizeSpeakerLabel(profile.name);
    if (!name) {
      return [];
    }

    const seenSamples = new Set<string>();
    const samples = profile.samples.flatMap((sample) => {
      if (!sample.audioPath.trim() || sample.endSeconds <= sample.startSeconds) {
        return [];
      }

      const embedding = normalizeEmbedding(sample.embedding);
      if (embedding.length === 0) {
        return [];
      }

      const normalizedSample: SpeakerProfileSample = {
        id: sample.id || crypto.randomUUID(),
        audioPath: sample.audioPath.trim(),
        startSeconds: sample.startSeconds,
        endSeconds: sample.endSeconds,
        addedAt: sample.addedAt || new Date().toISOString(),
        meetingId: sample.meetingId?.trim() || null,
        sourceSpeaker: sample.sourceSpeaker?.trim() || null,
        embedding,
      };
      const signature = speakerSampleSignature(normalizedSample);
      if (seenSamples.has(signature)) {
        return [];
      }

      seenSamples.add(signature);
      return [normalizedSample];
    });

    return [
      {
        id: profile.id || crypto.randomUUID(),
        name,
        updatedAt: profile.updatedAt || new Date().toISOString(),
        centroidEmbedding: normalizedEmbeddingCentroid(samples.map((sample) => sample.embedding)),
        samples,
      },
    ];
  });
}

function scoreSpeakerProfile(embedding: number[], profile: SpeakerProfile) {
  const centroidScore = cosineSimilarity(embedding, profile.centroidEmbedding);
  const sampleScores = profile.samples
    .map((sample) => cosineSimilarity(embedding, sample.embedding))
    .filter((score) => Number.isFinite(score))
    .sort((left, right) => right - left);
  const bestSampleScore = sampleScores[0] ?? 0;

  return {
    profile,
    score: Math.max(bestSampleScore, centroidScore),
    centroidScore,
    bestSampleScore,
  };
}

function recommendSpeakerProfile(embedding: number[], profiles: SpeakerProfile[]) {
  const ranked = profiles
    .map((profile) => scoreSpeakerProfile(embedding, profile))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score);
  const [best, alternate] = ranked;
  if (!best) {
    return null;
  }

  const threshold = best.profile.samples.length >= 3 ? 0.7 : 0.74;
  if (best.score < threshold) {
    return null;
  }

  const alternateScore = alternate?.score ?? 0;
  if (best.score < 0.82 && best.score - alternateScore < 0.04) {
    return null;
  }

  return {
    profileId: best.profile.id,
    profileName: best.profile.name,
    confidence: best.score,
    alternateConfidence: alternateScore,
  } satisfies SpeakerSuggestion;
}

function syncMeetingSuggestionNames(meetings: Meeting[], profiles: SpeakerProfile[]) {
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.name]));
  return meetings.map((meeting) => {
    const speakerSuggestions = Object.entries(meeting.speakerSuggestions).reduce<
      Record<string, SpeakerSuggestion>
    >((nextSuggestions, [speaker, suggestion]) => {
      const profileName = profileNames.get(suggestion.profileId);
      if (!profileName) {
        return nextSuggestions;
      }

      nextSuggestions[speaker] = {
        ...suggestion,
        profileName,
      };
      return nextSuggestions;
    }, {});

    return speakerSuggestions === meeting.speakerSuggestions
      ? meeting
      : {
          ...meeting,
          speakerSuggestions,
        };
  });
}

function speakerEmbeddingRequestsForMeeting(meeting: Meeting, speakerIds?: string[]) {
  const allowedSpeakers = speakerIds?.length
    ? new Set(speakerIds.map((speaker) => normalizeSpeakerId(speaker)).filter(Boolean))
    : null;
  const groupedSegments = new Map<string, DiarizationSegment[]>();

  for (const segment of meeting.diarizationSegments) {
    const speaker = normalizeSpeakerId(segment.speaker);
    if (!speaker || (allowedSpeakers && !allowedSpeakers.has(speaker))) {
      continue;
    }

    const existing = groupedSegments.get(speaker);
    if (existing) {
      existing.push(segment);
    } else {
      groupedSegments.set(speaker, [segment]);
    }
  }

  return Array.from(groupedSegments.entries()).map(([speaker, segments]) => ({
    speaker,
    segments,
  }));
}

function activeTimezone() {
  const value = state.generalSettings?.timezone.trim();
  return value || undefined;
}

function normalizeAudioRetentionPolicy(value: unknown): AudioRetentionPolicy {
  if (
    value === "none" ||
    value === "oneDay" ||
    value === "threeDays" ||
    value === "oneWeek" ||
    value === "oneMonth"
  ) {
    return value;
  }

  if (value === false) {
    return "none";
  }

  return "oneMonth";
}

function currentAudioRetentionPolicy() {
  return normalizeAudioRetentionPolicy(state.generalDraft.audioRetention);
}

function audioRetentionDurationMs(policy: AudioRetentionPolicy) {
  switch (policy) {
    case "none":
      return 0;
    case "oneDay":
      return 24 * 60 * 60 * 1000;
    case "threeDays":
      return 3 * 24 * 60 * 60 * 1000;
    case "oneWeek":
      return 7 * 24 * 60 * 60 * 1000;
    case "oneMonth":
      return 30 * 24 * 60 * 60 * 1000;
  }
}

function shouldRetainMeetingAudio(policy: AudioRetentionPolicy) {
  return policy !== "none";
}

function canRunMeetingAudioPostProcessing(meeting: Meeting) {
  return meeting.audioPath.trim().length > 0;
}

function getMeetingAudioSavedAt(meeting: Meeting) {
  const savedAt = meeting.audioSavedAt?.trim();
  if (savedAt) {
    return savedAt;
  }

  return meeting.audioPath.trim() ? meeting.updatedAt : null;
}

function meetingAudioExpired(meeting: Meeting, policy: AudioRetentionPolicy, nowMs = Date.now()) {
  if (meeting.status !== "done" || !meeting.audioPath.trim()) {
    return false;
  }

  if (!shouldRetainMeetingAudio(policy)) {
    return true;
  }

  const savedAt = getMeetingAudioSavedAt(meeting);
  if (!savedAt) {
    return false;
  }

  const savedAtMs = Date.parse(savedAt);
  if (!Number.isFinite(savedAtMs)) {
    return false;
  }

  return nowMs >= savedAtMs + audioRetentionDurationMs(policy);
}

function withoutRetainedMeetingAudio(
  meeting: Meeting,
  options: {
    clearDiarization?: boolean;
  } = {},
) {
  const audioPath = meeting.audioPath.trim();
  if (!audioPath) {
    return {
      meeting: {
        ...meeting,
        audioSavedAt: null,
      },
      deletedAudioPath: null,
    };
  }

  const clearDiarization = options.clearDiarization === true;
  return {
    meeting: {
      ...meeting,
      audioPath: "",
      audioSavedAt: null,
      diarizationSegments: clearDiarization ? [] : meeting.diarizationSegments,
      speakerLabels: clearDiarization ? {} : meeting.speakerLabels,
      speakerSuggestions: clearDiarization ? {} : meeting.speakerSuggestions,
      diarizationSpeakerCount: clearDiarization ? 0 : meeting.diarizationSpeakerCount,
      diarizationPipelineSource: clearDiarization ? null : meeting.diarizationPipelineSource,
      diarizationRanAt: clearDiarization ? null : meeting.diarizationRanAt,
    },
    deletedAudioPath: audioPath,
  };
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

export function getMeetingSpeakerLabel(meeting: Meeting, speaker: string) {
  const normalizedSpeaker = normalizeSpeakerId(speaker);

  if (!normalizedSpeaker) {
    return "Speaker";
  }

  return meeting.speakerLabels[normalizedSpeaker] ?? defaultSpeakerLabelForId(normalizedSpeaker);
}

export function getMeetingSpeakerSuggestion(meeting: Meeting, speaker: string) {
  const normalizedSpeaker = normalizeSpeakerId(speaker);
  if (!normalizedSpeaker) {
    return null;
  }

  return meeting.speakerSuggestions[normalizedSpeaker] ?? null;
}

export function meetingHasSpeakerOverride(meeting: Meeting, speaker: string) {
  const normalizedSpeaker = normalizeSpeakerId(speaker);
  if (!normalizedSpeaker) {
    return false;
  }

  return typeof meeting.speakerLabels[normalizedSpeaker] === "string";
}

function formatSpeakerTurnsMarkdown(meeting: Meeting) {
  if (meeting.diarizationSegments.length === 0) {
    return "";
  }

  const lines = meeting.diarizationSegments.map((segment) => {
    const range = `${formatClockSeconds(segment.startSeconds)}-${formatClockSeconds(segment.endSeconds)}`;
    return `- ${getMeetingSpeakerLabel(meeting, segment.speaker)}: ${range}`;
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

  return liveEntries.length > 0 ? mergeTranscriptEntries(entries, liveEntries) : entries;
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

function modelDownloadProgressCopy(download: ManagedModelDownloadState) {
  if (download.progressPercent !== null) {
    return `${download.progressPercent}%`;
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
  const modeCopy =
    snapshot.modelSettings.processingMode === "batch"
      ? "post-meeting batch transcription"
      : "live transcription";

  if (isDownloading && download) {
    const progress = download.currentFile
      ? download.progressPercent !== null
        ? `${download.currentFile} · ${modelDownloadProgressCopy(download)}`
        : download.currentFile
      : modelDownloadProgressCopy(download);

    return {
      kicker: "Downloading model",
      title: "Transcription model setup in progress",
      copy: `unsigned Char is downloading ${selectedModelLabel} and storing it locally on this Mac.`,
      detail: progress,
      actionLabel: null,
      secondaryActionLabel: null,
    };
  }

  if (isError && download) {
    return {
      kicker: "Setup required",
      title: "Transcription model setup failed",
      copy: download.error ?? "The model download did not complete.",
      detail: "Retry to finish local transcription setup.",
      actionLabel: "Retry download",
      secondaryActionLabel: "Choose another model",
    };
  }

  return {
    kicker: "Setup required",
    title: "Download transcription model",
    copy: `Download ${selectedModelLabel} once to run ${modeCopy} locally. The model is cached on this device.`,
    detail: snapshot.modelSettings.selectedModelDetail,
    actionLabel: "Download model",
    secondaryActionLabel: "Choose another model",
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
    audioSavedAt: null,
    requestedSpeakerCount: null,
    diarizationSegments: [],
    speakerLabels: {},
    speakerSuggestions: {},
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
  if (!meeting || !canRunMeetingAudioPostProcessing(meeting) || !state.diarizationSettings?.enabled) {
    return;
  }

  if (state.onboarding?.runningInsideAppBundle === false) {
    patch({
      meetingNote:
        "Auto-diarization is disabled in `bun desktop:dev`. Run `bun desktop` so the bundled app can process the meeting after it ends.",
    });
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
    progressPercent: null,
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

async function refreshTranscriptionSetupState() {
  await Promise.all([refreshManagedModelDownloadState(true), refreshModelSettings(true)]);
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

async function refreshAudioDeviceSettings(silent = false) {
  try {
    const audioDeviceSettings = await invoke<AudioDeviceSettings>("audio_device_settings_state");
    patch({
      audioDeviceSettings,
      ...(silent ? {} : { generalNote: "" }),
    });
  } catch (error) {
    if (!silent) {
      patch({ generalNote: `Failed to load audio devices: ${String(error)}` });
    }
  }
}

async function refreshAudioDevices() {
  if (state.audioDeviceRefreshBusy) {
    return;
  }

  patch({
    audioDeviceRefreshBusy: true,
    generalNote: "",
  });

  try {
    await refreshAudioDeviceSettings(false);
  } finally {
    patch({ audioDeviceRefreshBusy: false });
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

async function refreshSpeakerProfiles(silent = false) {
  try {
    const speakerProfiles = normalizeSpeakerProfiles(
      await invoke<SpeakerProfile[]>("speaker_profiles_state"),
    );
    patch({
      speakerProfiles,
      speakerProfilesNote: "",
      meetings: syncMeetingSuggestionNames(state.meetings, speakerProfiles),
    });
  } catch (error) {
    if (!silent) {
      patch({ speakerProfilesNote: `Failed to load speaker library: ${String(error)}` });
    }
  }
}

async function refreshSettingsWindowData(silent = false) {
  await Promise.all([
    refreshGeneralSettings(silent),
    refreshAudioDeviceSettings(silent),
    refreshSummarySettings(silent),
    refreshSpeakerProfiles(silent),
    refreshManagedModelDownloadState(silent),
    refreshModelSettings(silent),
  ]);
}

async function saveSpeakerProfiles(profiles: SpeakerProfile[], silent = false) {
  patch({ speakerProfilesBusy: true });

  try {
    const preparedProfiles = prepareSpeakerProfilesForSave(profiles);
    const speakerProfiles = normalizeSpeakerProfiles(
      await invoke<SpeakerProfile[]>("save_speaker_profiles", { profiles: preparedProfiles }),
    );
    patch({
      speakerProfiles,
      speakerProfilesBusy: false,
      speakerProfilesNote: "",
      meetings: syncMeetingSuggestionNames(state.meetings, speakerProfiles),
    });
    return speakerProfiles;
  } catch (error) {
    patch({
      speakerProfilesBusy: false,
      ...(silent
        ? {}
        : { speakerProfilesNote: `Speaker library save failed: ${String(error)}` }),
    });
    return null;
  }
}

async function analyzeMeetingSpeakerEmbeddings(meeting: Meeting, speakerIds?: string[]) {
  const speakers = speakerEmbeddingRequestsForMeeting(meeting, speakerIds);
  if (!meeting.audioPath.trim() || speakers.length === 0) {
    return { speakers: [] } satisfies SpeakerEmbeddingAnalysisResult;
  }

  return normalizeSpeakerEmbeddingAnalysisResult(
    await invoke<SpeakerEmbeddingAnalysisResult>("analyze_speaker_embeddings", {
      input: {
        audioPath: meeting.audioPath.trim(),
        speakers,
      } satisfies SpeakerEmbeddingAnalysisInput,
    }),
  );
}

async function refreshMeetingSpeakerSuggestions(meetingId: string, speakerIds?: string[]) {
  const meeting = getMeeting(meetingId);
  if (!meeting) {
    return;
  }

  const requestedSpeakers = speakerIds?.map((speaker) => normalizeSpeakerId(speaker)).filter(Boolean);
  if (state.speakerProfiles.length === 0 || !meeting.audioPath.trim() || meeting.diarizationSegments.length === 0) {
    updateMeeting(meetingId, (current) => {
      const speakerSuggestions = { ...current.speakerSuggestions };
      for (const speaker of requestedSpeakers ?? Object.keys(speakerSuggestions)) {
        delete speakerSuggestions[speaker];
      }

      return {
        ...current,
        speakerSuggestions,
      };
    });
    return;
  }

  try {
    const analysis = await analyzeMeetingSpeakerEmbeddings(meeting, requestedSpeakers);
    const nextSuggestions = { ...meeting.speakerSuggestions };
    for (const speaker of requestedSpeakers ?? Object.keys(nextSuggestions)) {
      delete nextSuggestions[speaker];
    }

    for (const speaker of analysis.speakers) {
      const suggestion = recommendSpeakerProfile(speaker.embedding, state.speakerProfiles);
      if (suggestion) {
        nextSuggestions[speaker.speaker] = suggestion;
      }
    }

    updateMeeting(meetingId, (current) => ({
      ...current,
      speakerSuggestions: nextSuggestions,
      updatedAt: current.updatedAt,
    }));
  } catch (error) {
    patch({
      meetingNote: `Speaker matching failed: ${String(error)}`,
    });
  }
}

function removeMeetingSpeakerSamplesFromProfiles(
  profiles: SpeakerProfile[],
  meetingId: string,
  speakerId: string,
) {
  const normalizedSpeaker = normalizeSpeakerId(speakerId);
  let changed = false;

  const nextProfiles = profiles.flatMap((profile) => {
    const samples = profile.samples.filter((sample) => {
      const matchesSource =
        sample.meetingId === meetingId && normalizeSpeakerId(sample.sourceSpeaker ?? "") === normalizedSpeaker;
      if (matchesSource) {
        changed = true;
      }
      return !matchesSource;
    });

    if (samples.length === 0 && profile.samples.length > 0) {
      return [];
    }

    if (samples.length === profile.samples.length) {
      return [profile];
    }

    return [
      {
        ...profile,
        updatedAt: new Date().toISOString(),
        centroidEmbedding: normalizedEmbeddingCentroid(samples.map((sample) => sample.embedding)),
        samples,
      },
    ];
  });

  return changed ? nextProfiles : profiles;
}

function mergeSpeakerProfileSamples(
  existingSamples: SpeakerProfileSample[],
  incomingSamples: SpeakerProfileSample[],
) {
  const seenSignatures = new Set<string>();
  const merged: SpeakerProfileSample[] = [];

  for (const sample of [...incomingSamples, ...existingSamples]) {
    const signature = speakerSampleSignature(sample);
    if (seenSignatures.has(signature)) {
      continue;
    }

    seenSignatures.add(signature);
    merged.push(sample);
  }

  return merged.slice(0, 12);
}

async function syncSpeakerProfileForMeetingSpeaker(
  meetingId: string,
  speakerId: string,
  label: string | null,
) {
  const normalizedSpeaker = normalizeSpeakerId(speakerId);
  const nextLabel = label ? normalizeSpeakerLabel(label) : null;
  const strippedProfiles = removeMeetingSpeakerSamplesFromProfiles(
    state.speakerProfiles,
    meetingId,
    normalizedSpeaker,
  );

  if (!nextLabel) {
    if (strippedProfiles !== state.speakerProfiles) {
      await saveSpeakerProfiles(strippedProfiles, true);
    }
    await refreshMeetingSpeakerSuggestions(meetingId, [normalizedSpeaker]);
    return;
  }

  const meeting = getMeeting(meetingId);
  if (!meeting || !meeting.audioPath.trim()) {
    if (strippedProfiles !== state.speakerProfiles) {
      await saveSpeakerProfiles(strippedProfiles, true);
    }
    return;
  }

  try {
    const analysis = await analyzeMeetingSpeakerEmbeddings(meeting, [normalizedSpeaker]);
    const speakerAnalysis = analysis.speakers.find((speaker) => speaker.speaker === normalizedSpeaker);
    if (!speakerAnalysis || speakerAnalysis.samples.length === 0) {
      if (strippedProfiles !== state.speakerProfiles) {
        await saveSpeakerProfiles(strippedProfiles, true);
      }
      return;
    }

    const profileKey = speakerProfileNameKey(nextLabel);
    const nextSamples = speakerAnalysis.samples.map((sample) => ({
      id: crypto.randomUUID(),
      audioPath: meeting.audioPath.trim(),
      startSeconds: sample.startSeconds,
      endSeconds: sample.endSeconds,
      addedAt: new Date().toISOString(),
      meetingId,
      sourceSpeaker: normalizedSpeaker,
      embedding: sample.embedding,
    })) satisfies SpeakerProfileSample[];
    const existingIndex = strippedProfiles.findIndex(
      (profile) => speakerProfileNameKey(profile.name) === profileKey,
    );

    const nextProfiles = [...strippedProfiles];
    if (existingIndex >= 0) {
      const profile = nextProfiles[existingIndex];
      const samples = mergeSpeakerProfileSamples(profile.samples, nextSamples);
      nextProfiles[existingIndex] = {
        ...profile,
        name: nextLabel,
        updatedAt: new Date().toISOString(),
        centroidEmbedding: normalizedEmbeddingCentroid(samples.map((sample) => sample.embedding)),
        samples,
      };
    } else {
      nextProfiles.unshift({
        id: crypto.randomUUID(),
        name: nextLabel,
        updatedAt: new Date().toISOString(),
        centroidEmbedding: normalizedEmbeddingCentroid(nextSamples.map((sample) => sample.embedding)),
        samples: nextSamples,
      });
    }

    await saveSpeakerProfiles(nextProfiles, true);
    await refreshMeetingSpeakerSuggestions(meetingId);
  } catch (error) {
    patch({ speakerProfilesNote: `Failed to learn speaker voice: ${String(error)}` });
  }
}

async function ensureModelReady() {
  await refreshTranscriptionSetupState();

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

  if (state.onboarding?.runningInsideAppBundle === false) {
    throw new Error(
      "Speaker diarization is only enabled in the bundled app right now. Run `bun desktop` instead of `bun desktop:dev`.",
    );
  }

  if (state.diarizationSettings.ready) {
    return;
  }

  throw new Error(state.diarizationSettings.status);
}

function permissionLabel(permission: PermissionKind) {
  return permission === "microphone" ? "Microphone" : "System audio";
}

function permissionHostHint(permission: PermissionKind) {
  if (!state.onboarding) {
    return "";
  }

  if (state.onboarding.runningInsideAppBundle === false) {
    return ` If no ${permissionLabel(permission).toLowerCase()} prompt appears, macOS may be treating the app that launched \`bun desktop:dev\` as the permission host instead of unsigned Char. Check Warp, Ghostty, or Terminal, or run \`bun desktop\`.`;
  }

  if (state.onboarding.permissionHostMatchesBundleIdentifier === false) {
    const actual = state.onboarding.permissionHostIdentifier
      ? ` It is currently signed as \`${state.onboarding.permissionHostIdentifier}\` instead of \`${state.onboarding.bundleIdentifier}\`.`
      : "";
    return ` macOS may not register this copy of unsigned Char in Privacy & Security.${actual} Reopen it with \`bun desktop\`, which re-signs the local debug app, or use /Applications/unsigned Char.app.`;
  }

  return "";
}

function permissionDeniedMessage(permission: PermissionKind) {
  if (permission === "microphone") {
    return `Microphone access is required to record meetings. Allow the app in System Settings > Privacy & Security > Microphone.${permissionHostHint(permission)}`;
  }

  return `${permissionLabel(permission)} access is off. Enable it in System Settings and try again.${permissionHostHint(permission)}`;
}

function permissionPendingMessage(permission: PermissionKind) {
  if (permission === "microphone") {
    return `Microphone permission request did not finish. Try recording again and allow access when prompted.${permissionHostHint(permission)}`;
  }

  return `${permissionLabel(permission)} permission request did not finish. Try again and allow access when prompted.${permissionHostHint(permission)}`;
}

async function requestPermissionForMeeting(permission: PermissionKind) {
  await refreshPermissions(true);
  const status = state.onboarding?.permissions[permission];
  if (!status || status === "authorized") {
    return;
  }

  if (status === "denied") {
    await invoke("open_permission_settings", { permission });
    throw new Error(permissionDeniedMessage(permission));
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
    throw new Error(permissionDeniedMessage(permission));
  }

  if (nextStatus !== "authorized" && permission === "microphone") {
    throw new Error(permissionPendingMessage(permission));
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

  let audioPathToDelete: string | null = null;
  const finishedAt = new Date().toISOString();
  const audioRetention = currentAudioRetentionPolicy();

  updateMeeting(meeting.id, (current) => {
    let transcript = current.transcript;

    if (entries.length > 0) {
      if (mode === "batch") {
        transcript = entries;
      } else if (!sameTranscriptEntries(current.transcript.slice(-entries.length), entries)) {
        transcript = mergeTranscriptEntries(current.transcript, entries);
      }
    }

    const transcriptChanged = transcript !== current.transcript;
    let nextMeeting: Meeting = {
      ...current,
      transcript,
      status: markDone ? "done" : current.status,
      summary: transcriptChanged ? null : current.summary,
      summaryProviderLabel: transcriptChanged ? null : current.summaryProviderLabel,
      summaryModel: transcriptChanged ? null : current.summaryModel,
      summaryUpdatedAt: transcriptChanged ? null : current.summaryUpdatedAt,
      updatedAt: finishedAt,
      audioSavedAt: markDone && shouldRetainMeetingAudio(audioRetention) ? finishedAt : current.audioSavedAt,
    };

    if (markDone && !shouldRetainMeetingAudio(audioRetention)) {
      const retention = withoutRetainedMeetingAudio(nextMeeting, {
        clearDiarization: true,
      });
      nextMeeting = retention.meeting;
      audioPathToDelete = retention.deletedAudioPath;
    }

    return nextMeeting;
  });

  patch({
    liveTranscriptText: "",
    liveTranscriptEntries: [],
    liveTranscriptionMode: null,
    recordingMeetingId: null,
    transcriptionStopping: false,
  });

  return {
    meetingId: meeting.id,
    audioPathToDelete,
  };
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
      const completedMeeting = finalizeLiveTranscript(true);
      if (completedMeeting) {
        if (completedMeeting.audioPathToDelete) {
          void deleteMeetingAudioQuietly(completedMeeting.audioPathToDelete);
        }
        queueMeetingAutoDiarization(completedMeeting.meetingId);
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
    const completedMeeting = finalizeLiveTranscript(true);
    if (completedMeeting) {
      if (completedMeeting.audioPathToDelete) {
        void deleteMeetingAudioQuietly(completedMeeting.audioPathToDelete);
      }
      queueMeetingAutoDiarization(completedMeeting.meetingId);
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

async function purgeExpiredMeetingAudio(policy = currentAudioRetentionPolicy()) {
  const audioPathsToDelete: string[] = [];
  const nowMs = Date.now();
  let changed = false;

  state = {
    ...state,
    meetings: state.meetings.map((meeting) => {
      if (!meetingAudioExpired(meeting, policy, nowMs)) {
        return meeting;
      }

      const retention = withoutRetainedMeetingAudio(meeting);
      if (!retention.deletedAudioPath) {
        return meeting;
      }

      changed = true;
      audioPathsToDelete.push(retention.deletedAudioPath);
      return retention.meeting;
    }),
  };

  if (changed) {
    persistMeetings();
    emit();
  }

  await Promise.all(audioPathsToDelete.map((path) => deleteMeetingAudioQuietly(path)));
}

async function reconcilePersistedLiveMeetings() {
  const liveMeetings = sortedMeetings(
    state.meetings.filter((meeting) => meeting.status === "live"),
  );
  let snapshot: LiveTranscriptionState;
  let audioRetention: AudioRetentionPolicy = "oneMonth";

  try {
    snapshot = await invoke<LiveTranscriptionState>("live_transcription_state");
  } catch {
    return;
  }

  try {
    audioRetention = normalizeAudioRetentionPolicy(
      state.generalSettings?.audioRetention ??
        (await invoke<GeneralSettings>("general_settings_state")).audioRetention,
    );
  } catch {}

  const activeMeetingId = snapshot.running ? liveMeetings[0]?.id ?? null : null;
  const nextLiveTranscriptEntries = normalizeTranscriptEntries(snapshot.entries);
  const nextLiveTranscriptText =
    transcriptEntriesToText(nextLiveTranscriptEntries) || snapshot.text.trim();
  const nextLiveTranscriptionMode = snapshot.mode;
  const nextMeetingNote = snapshot.error || state.meetingNote;
  const exportPathsToDelete: string[] = [];
  const audioPathsToDelete: string[] = [];
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

    let nextMeeting: Meeting = {
      ...meeting,
      status: "done" as const,
      updatedAt: finishedAt,
      audioSavedAt: shouldRetainMeetingAudio(audioRetention) ? finishedAt : meeting.audioSavedAt,
    };

    if (!shouldRetainMeetingAudio(audioRetention)) {
      const retention = withoutRetainedMeetingAudio(nextMeeting, {
        clearDiarization: true,
      });
      nextMeeting = retention.meeting;
      if (retention.deletedAudioPath) {
        audioPathsToDelete.push(retention.deletedAudioPath);
      }
    }

    return [nextMeeting];
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
  await Promise.all([
    ...exportPathsToDelete.map((path) => deleteMeetingExportQuietly(path)),
    ...audioPathsToDelete.map((path) => deleteMeetingAudioQuietly(path)),
  ]);
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
    return createMeeting(meetingId, snapshot.audioPath.trim());
  } catch (error) {
    await refreshTranscriptionSetupState();
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

    dismissDiarizationBanner(meeting.id);
    await ensureModelReady();
    await prepareMeetingPermissions();
    await stopActiveRecordingIfNeeded(meeting.id);
    const snapshot = await startLiveTranscriptionSession(meeting.id);
    updateMeeting(meeting.id, (current) => ({
      ...current,
      audioPath: snapshot.audioPath.trim() || current.audioPath,
      audioSavedAt: null,
      status: "live",
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    await refreshTranscriptionSetupState();
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

  if (!canRunMeetingAudioPostProcessing(meeting)) {
    patch({
      meetingNote: "Speaker diarization requires saved meeting audio. Choose an audio retention option other than Don't save.",
    });
    return;
  }

  patch({
    diarizationRunBusy: true,
    diarizationMeetingId: meetingId,
    diarizationIndicatorMinimized: false,
    diarizationBannerMessage: null,
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
      speakerSuggestions: {},
      diarizationSpeakerCount: result.speakerCount,
      diarizationPipelineSource: result.pipelineSource,
      diarizationRanAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const completionMessage =
      result.segments.length === 0
        ? options.automatic
          ? "Auto-diarization finished, but no speaker turns were detected."
          : "Diarization finished, but no speaker turns were detected."
        : options.automatic
          ? `Auto-diarized ${result.speakerCount} speakers across ${result.segments.length} segments.`
          : `Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`;

    patch({
      diarizationMeetingId: meetingId,
      diarizationIndicatorMinimized: false,
      diarizationBannerMessage: completionMessage,
      meetingNote: "",
    });
    void refreshMeetingSpeakerSuggestions(meetingId);
  } catch (error) {
    patch({
      diarizationMeetingId: null,
      diarizationIndicatorMinimized: false,
      diarizationBannerMessage: null,
      meetingNote:
        error instanceof Error
          ? options.automatic
            ? `Auto-diarization failed: ${error.message}`
            : error.message
          : String(error),
    });
  } finally {
    patch({
      diarizationRunBusy: false,
      diarizationMeetingId:
        state.diarizationBannerMessage && state.diarizationMeetingId === meetingId
          ? meetingId
          : state.diarizationMeetingId,
      diarizationIndicatorMinimized:
        state.diarizationBannerMessage && state.diarizationMeetingId === meetingId
          ? false
          : state.diarizationIndicatorMinimized,
    });
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
    diarizationMeetingId:
      state.diarizationMeetingId === meetingId ? null : state.diarizationMeetingId,
    diarizationIndicatorMinimized:
      state.diarizationMeetingId === meetingId ? false : state.diarizationIndicatorMinimized,
    diarizationBannerMessage:
      state.diarizationMeetingId === meetingId ? null : state.diarizationBannerMessage,
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
        audioRetention: state.generalDraft.audioRetention,
      },
    });

    patch({
      generalSettings,
      generalDraft: syncGeneralDraft(generalSettings),
      generalNote: "",
    });
    await refreshModelSettings(true);
    if (!isSettingsWindow) {
      await purgeExpiredMeetingAudio(generalSettings.audioRetention);
    }
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
  if (summaryAutosaveTimer !== null) {
    window.clearTimeout(summaryAutosaveTimer);
    summaryAutosaveTimer = null;
  }

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

function queueSummaryAutosave(delay = SUMMARY_AUTOSAVE_MS) {
  if (summaryAutosaveTimer !== null) {
    window.clearTimeout(summaryAutosaveTimer);
  }

  summaryAutosaveTimer = window.setTimeout(() => {
    summaryAutosaveTimer = null;
    void saveSummarySettings();
  }, delay);
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
    refreshAudioDeviceSettings(true),
    refreshGeneralSettings(true),
    refreshSummarySettings(true),
    refreshSpeakerProfiles(true),
    refreshPermissions(true),
    refreshManagedModelDownloadState(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]).then(() => purgeExpiredMeetingAudio());
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

function updateMeetingSpeakerLabel(meetingId: string, speaker: string, nextLabel: string) {
  const normalizedSpeaker = normalizeSpeakerId(speaker);
  const currentMeeting = getMeeting(meetingId);
  if (
    !currentMeeting ||
    !normalizedSpeaker ||
    !currentMeeting.diarizationSegments.some((segment) => segment.speaker === normalizedSpeaker)
  ) {
    return;
  }

  const normalizedLabel = normalizeSpeakerLabel(nextLabel);
  const defaultLabel = defaultSpeakerLabelForId(normalizedSpeaker);
  const currentOverride = currentMeeting.speakerLabels[normalizedSpeaker] ?? null;
  const nextOverride =
    normalizedLabel.length === 0 || normalizedLabel === defaultLabel ? null : normalizedLabel;

  if (currentOverride === nextOverride) {
    return;
  }

  updateMeeting(meetingId, (meeting) => {
    const speakerLabels = { ...meeting.speakerLabels };
    const speakerSuggestions = { ...meeting.speakerSuggestions };

    if (nextOverride) {
      speakerLabels[normalizedSpeaker] = nextOverride;
    } else {
      delete speakerLabels[normalizedSpeaker];
    }
    delete speakerSuggestions[normalizedSpeaker];

    return {
      ...meeting,
      speakerLabels,
      speakerSuggestions,
      updatedAt: new Date().toISOString(),
    };
  });
  void syncSpeakerProfileForMeetingSpeaker(meetingId, normalizedSpeaker, nextOverride);
}

function updateSpeakerProfileName(profileId: string, nextName: string) {
  const normalizedName = normalizeSpeakerLabel(nextName);
  if (!normalizedName) {
    return;
  }

  const sourceProfile = state.speakerProfiles.find((profile) => profile.id === profileId);
  if (!sourceProfile) {
    return;
  }

  const targetProfile = state.speakerProfiles.find(
    (profile) =>
      profile.id !== profileId && speakerProfileNameKey(profile.name) === speakerProfileNameKey(normalizedName),
  );
  if (targetProfile) {
    const mergedProfiles = state.speakerProfiles
      .filter((profile) => profile.id !== profileId && profile.id !== targetProfile.id)
      .concat({
        ...targetProfile,
        name: normalizedName,
        updatedAt: new Date().toISOString(),
        samples: mergeSpeakerProfileSamples(targetProfile.samples, sourceProfile.samples),
        centroidEmbedding: normalizedEmbeddingCentroid(
          mergeSpeakerProfileSamples(targetProfile.samples, sourceProfile.samples).map(
            (sample) => sample.embedding,
          ),
        ),
      });
    void saveSpeakerProfiles(mergedProfiles);
    return;
  }

  void saveSpeakerProfiles(
    state.speakerProfiles.map((profile) =>
      profile.id === profileId
        ? {
            ...profile,
            name: normalizedName,
            updatedAt: new Date().toISOString(),
          }
        : profile,
    ),
  );
}

function deleteSpeakerProfile(profileId: string) {
  void saveSpeakerProfiles(state.speakerProfiles.filter((profile) => profile.id !== profileId));
}

function deleteSpeakerProfileSample(profileId: string, sampleId: string) {
  const nextProfiles = state.speakerProfiles.flatMap((profile) => {
    if (profile.id !== profileId) {
      return [profile];
    }

    const samples = profile.samples.filter((sample) => sample.id !== sampleId);
    if (samples.length === 0) {
      return [];
    }

    return [
      {
        ...profile,
        updatedAt: new Date().toISOString(),
        centroidEmbedding: normalizedEmbeddingCentroid(samples.map((sample) => sample.embedding)),
        samples,
      },
    ];
  });
  void saveSpeakerProfiles(nextProfiles);
}

function setHomeScrollTop(homeScrollTop: number) {
  patch({ homeScrollTop });
}

function setSelectedModel(modelId: SpeechModelId) {
  if (!state.modelSettings || state.modelSettings.selectedModelId === modelId) {
    return;
  }

  if (modelId === "parakeetStreaming") {
    void saveModelSettings({ processingMode: "realtime" });
    return;
  }

  void saveModelSettings({
    processingMode: "batch",
    batchModelId: modelId,
  });
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

function setAudioRetention(audioRetention: AudioRetentionPolicy) {
  patch({
    generalDraft: {
      ...state.generalDraft,
      audioRetention,
    },
    generalNote: "",
  });
  void saveGeneralSettings();
}

async function setAudioDevice(
  command: "set_audio_input_device" | "set_audio_output_device",
  deviceId: string,
  label: string,
) {
  const normalizedDeviceId = deviceId.trim();
  if (!normalizedDeviceId || state.generalBusy) {
    return;
  }

  patch({
    generalBusy: true,
    generalNote: "",
  });

  try {
    const audioDeviceSettings = await invoke<AudioDeviceSettings>(command, {
      deviceId: normalizedDeviceId,
    });
    patch({
      audioDeviceSettings,
      generalNote: "",
    });
  } catch (error) {
    patch({
      generalNote: `${label} selection failed: ${String(error)}`,
    });
  } finally {
    patch({ generalBusy: false });
  }
}

function setAudioInputDevice(deviceId: string) {
  void setAudioDevice("set_audio_input_device", deviceId, "Microphone");
}

function setAudioOutputDevice(deviceId: string) {
  void setAudioDevice("set_audio_output_device", deviceId, "Speaker");
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
  queueSummaryAutosave(0);
}

function setSummaryModel(model: string) {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      model,
    },
    summaryNote: "",
  });
  queueSummaryAutosave();
}

function setSummaryBaseUrl(baseUrl: string) {
  patch({
    summaryDraft: {
      ...state.summaryDraft,
      baseUrl,
    },
    summaryNote: "",
  });
  queueSummaryAutosave();
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
  queueSummaryAutosave();
}

async function removeSummaryApiKey() {
  if (summaryAutosaveTimer !== null) {
    window.clearTimeout(summaryAutosaveTimer);
    summaryAutosaveTimer = null;
  }

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

async function openSettingsWindow(section?: "ai-summaries" | "transcription-model") {
  try {
    await invoke("open_settings_window", { section });
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
    refreshAudioDeviceSettings(true),
    refreshGeneralSettings(true),
    refreshSummarySettings(true),
    refreshSpeakerProfiles(true),
    refreshPermissions(true),
    refreshManagedModelDownloadState(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]);
  await purgeExpiredMeetingAudio();
  patch({ initialized: true });
}

export const appStore = {
  subscribe,
  getSnapshot,
  start,
  startMeeting,
  toggleMeetingStatus,
  runMeetingDiarization,
  dismissDiarizationBanner,
  setDiarizationIndicatorMinimized,
  revealMeetingExportInFinder,
  deleteMeeting,
  startManagedModelDownload,
  updateMeetingTitle,
  updateMeetingAudioPath,
  updateMeetingRequestedSpeakerCount,
  updateMeetingSpeakerLabel,
  updateSpeakerProfileName,
  deleteSpeakerProfile,
  deleteSpeakerProfileSample,
  setHomeScrollTop,
  setSelectedModel,
  setMainLanguage,
  setTimezone,
  setAudioRetention,
  setAudioInputDevice,
  setAudioOutputDevice,
  refreshAudioDevices,
  addSpokenLanguage,
  removeSpokenLanguage,
  setSummaryProvider,
  setSummaryModel,
  setSummaryBaseUrl,
  setSummaryApiKey,
  removeSummaryApiKey,
  openSettingsWindow,
  refreshSettingsWindowData,
  generateMeetingSummary,
  getMeetingById,
};
