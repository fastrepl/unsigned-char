import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useSyncExternalStore } from "react";

export type PermissionKind = "microphone" | "systemAudio";
export type PermissionStatus = "neverRequested" | "authorized" | "denied";
export type MeetingStatus = "live" | "done";
export type ModelSource = "bundled" | "huggingFace";

export type OnboardingState = {
  productName: string;
  engine: string;
  reference: string;
  permissions: Record<PermissionKind, PermissionStatus>;
  ready: boolean;
};

export type Meeting = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
  transcript: string[];
  audioPath: string;
  diarizationSegments: DiarizationSegment[];
  diarizationSpeakerCount: number;
  diarizationPipelineSource: string | null;
  diarizationRanAt: string | null;
  exportPath: string | null;
};

export type ModelSettings = {
  source: ModelSource;
  bundledLabel: string;
  bundledRelativePath: string;
  bundledResolvedPath: string;
  bundledReady: boolean;
  bundledStatus: string;
  huggingFaceRepo: string;
  huggingFaceRevision: string;
  huggingFaceLocalPath: string;
  huggingFaceResolvedPath: string | null;
  huggingFaceReady: boolean;
  huggingFaceStatus: string;
  selectedReady: boolean;
  selectedReference: string | null;
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
};

type AppState = {
  initialized: boolean;
  onboarding: OnboardingState | null;
  modelSettings: ModelSettings | null;
  modelDownload: ManagedModelDownloadState | null;
  diarizationSettings: DiarizationSettings | null;
  generalSettings: GeneralSettings | null;
  generalDraft: GeneralDraft;
  meetings: Meeting[];
  permissionNote: string;
  generalNote: string;
  modelBusy: boolean;
  generalBusy: boolean;
  startMeetingBusy: boolean;
  transcriptionBusy: boolean;
  transcriptionRunning: boolean;
  liveTranscriptText: string;
  recordingMeetingId: string | null;
  diarizationRunBusy: boolean;
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
const MODEL_DOWNLOAD_POLL_MS = 1000;
const MEETING_MARKDOWN_SYNC_MS = 250;
const MARKDOWN_SAVE_ERROR_PREFIX = "Markdown save failed:";

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

let state: AppState = {
  initialized: false,
  onboarding: null,
  modelSettings: null,
  modelDownload: null,
  diarizationSettings: null,
  generalSettings: null,
  generalDraft: emptyGeneralDraft(),
  meetings: loadMeetings(),
  permissionNote: "",
  generalNote: "",
  modelBusy: false,
  generalBusy: false,
  startMeetingBusy: false,
  transcriptionBusy: false,
  transcriptionRunning: false,
  liveTranscriptText: "",
  recordingMeetingId: null,
  diarizationRunBusy: false,
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
    transcript: candidate.transcript.filter((line): line is string => typeof line === "string"),
    audioPath: typeof candidate.audioPath === "string" ? candidate.audioPath : "",
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
    exportPath:
      typeof candidate.exportPath === "string" && candidate.exportPath.length > 0
        ? candidate.exportPath
        : null,
  };
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

function buildMarkdownExport(meeting: Meeting): MarkdownExport {
  return {
    id: meeting.id,
    title: meeting.title,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    status: meeting.status,
    audioPath: meeting.audioPath.trim(),
    diarizationSpeakerCount: meeting.diarizationSpeakerCount,
    diarizationPipelineSource: meeting.diarizationPipelineSource,
    diarizationRanAt: meeting.diarizationRanAt,
    path: meeting.exportPath,
    transcript: getMeetingTranscriptLines(meeting).join("\n\n"),
    speakerTurns: formatSpeakerTurnsMarkdown(meeting),
  };
}

export function sortedMeetings(meetings: Meeting[]) {
  return [...meetings].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

export function getMeetingTranscriptLines(meeting: Meeting) {
  const lines = [...meeting.transcript];
  const liveText =
    state.recordingMeetingId === meeting.id ? state.liveTranscriptText.trim() : "";
  if (liveText) {
    lines.push(liveText);
  }

  return lines;
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
  const localPath = download?.localPath || snapshot.modelSettings.huggingFaceLocalPath;

  if (isDownloading && download) {
    const progress = download.currentFile
      ? `${download.currentFile} · ${modelDownloadProgressCopy(download)}`
      : modelDownloadProgressCopy(download);

    return {
      kicker: "Downloading model",
      title: "Transcription model setup in progress",
      copy: "unsigned char is downloading Qwen3-ASR once and storing it locally on this Mac.",
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
    copy:
      "Download Qwen3-ASR once to run transcription locally. The model is stored outside the app bundle and stays on this device.",
    detail: "The download is about 1.8 GB.",
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

function createMeeting() {
  const createdAt = new Date().toISOString();
  const meeting: Meeting = {
    id: crypto.randomUUID(),
    title: buildMeetingTitle(createdAt),
    createdAt,
    updatedAt: createdAt,
    status: "live",
    transcript: [],
    audioPath: "",
    diarizationSegments: [],
    diarizationSpeakerCount: 0,
    diarizationPipelineSource: null,
    diarizationRanAt: null,
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

async function syncMeetingMarkdown(id: string) {
  const meeting = getMeeting(id);
  if (!meeting) {
    return null;
  }

  try {
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
  if (isSettingsWindow) {
    return;
  }

  clearMeetingMarkdownSync(meeting.id);

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
  if (isSettingsWindow) {
    return;
  }

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

async function ensureWindowAlwaysOnTop() {
  try {
    await currentWindow.setAlwaysOnTop(true);
  } catch (error) {
    if (!isSettingsWindow) {
      patch({
        meetingNote:
          error instanceof Error
            ? `Always on top failed: ${error.message}`
            : `Always on top failed: ${String(error)}`,
      });
    }
  }
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

  try {
    const modelDownload = await invoke<ManagedModelDownloadState>("managed_model_download_state");
    patch({ modelDownload });
    syncModelDownloadPolling();

    if (previousStatus === "downloading" && modelDownload.status !== "downloading") {
      await Promise.all([refreshModelSettings(true), refreshPermissions(true)]);
    }
  } catch (error) {
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

  if (state.modelSettings.source === "bundled") {
    throw new Error(state.modelSettings.bundledStatus);
  }

  throw new Error(state.modelSettings.huggingFaceStatus);
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

async function requestPermissionForMeeting(permission: PermissionKind) {
  await refreshPermissions(true);
  const status = state.onboarding?.permissions[permission];
  if (!status || status === "authorized") {
    return;
  }

  if (status === "denied") {
    await invoke("open_permission_settings", { permission });
    throw new Error(
      `${permission === "microphone" ? "Microphone" : "System audio"} access is off. Enable it in System Settings and try again.`,
    );
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
    throw new Error(
      `${permission === "microphone" ? "Microphone" : "System audio"} access is required to start a meeting.`,
    );
  }
}

async function startLiveTranscriptionSession(meetingId: string | null) {
  const snapshot = await invoke<LiveTranscriptionState>("start_live_transcription");
  if (snapshot.error) {
    throw new Error(snapshot.error);
  }

  if (!snapshot.running) {
    throw new Error("Failed to start local transcription.");
  }

  state = {
    ...state,
    recordingMeetingId: meetingId,
    transcriptionRunning: snapshot.running,
    liveTranscriptText: snapshot.text.trim(),
  };
  emit();
  syncLiveTranscriptionPolling();
}

function finalizeLiveTranscript(markDone = false) {
  const meeting = getRecordingMeeting();
  const text = state.liveTranscriptText.trim();

  if (!meeting) {
    patch({
      liveTranscriptText: "",
      recordingMeetingId: null,
    });
    return;
  }

  updateMeeting(meeting.id, (current) => {
    const transcript =
      text && current.transcript[current.transcript.length - 1] !== text
        ? [...current.transcript, text]
        : current.transcript;

    return {
      ...current,
      transcript,
      status: markDone ? "done" : current.status,
      updatedAt: new Date().toISOString(),
    };
  });

  patch({
    liveTranscriptText: "",
    recordingMeetingId: null,
  });
}

async function refreshLiveTranscription(silent = false) {
  try {
    const snapshot = await invoke<LiveTranscriptionState>("live_transcription_state");
    const wasRunning = state.transcriptionRunning;

    state = {
      ...state,
      transcriptionRunning: snapshot.running,
      liveTranscriptText: snapshot.text.trim(),
      meetingNote: snapshot.error || state.meetingNote,
    };
    emit();

    if (wasRunning && !snapshot.running) {
      finalizeLiveTranscript(true);
    }
  } catch (error) {
    if (!silent) {
      patch({ meetingNote: `Live transcription failed: ${String(error)}` });
    }
    patch({ transcriptionRunning: false });
  } finally {
    state = {
      ...state,
      transcriptionBusy: false,
    };
    emit();
    syncLiveTranscriptionPolling();
  }
}

async function stopLiveTranscriptionSession() {
  const snapshot = await invoke<LiveTranscriptionState>("stop_live_transcription");

  state = {
    ...state,
    transcriptionRunning: snapshot.running,
    liveTranscriptText: snapshot.text.trim(),
    meetingNote: snapshot.error || state.meetingNote,
  };
  emit();

  finalizeLiveTranscript(true);
  syncLiveTranscriptionPolling();
}

async function stopActiveRecordingIfNeeded(nextMeetingId: string | null = null) {
  const activeMeeting = getRecordingMeeting();
  if (!activeMeeting || activeMeeting.id === nextMeetingId) {
    return;
  }

  await stopLiveTranscriptionSession();
  updateMeeting(activeMeeting.id, (current) => ({
    ...current,
    status: "done",
    updatedAt: new Date().toISOString(),
  }));
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
  });

  try {
    await ensureModelReady();
    await requestPermissionForMeeting("microphone");
    await stopActiveRecordingIfNeeded();
    patch({ transcriptionBusy: true });
    await startLiveTranscriptionSession(null);
    const meeting = createMeeting();
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
      await stopLiveTranscriptionSession();
      updateMeeting(meeting.id, (current) => ({
        ...current,
        status: "done",
        updatedAt: new Date().toISOString(),
      }));
      return;
    }

    await ensureModelReady();
    await requestPermissionForMeeting("microphone");
    await stopActiveRecordingIfNeeded(meeting.id);
    await startLiveTranscriptionSession(meeting.id);
    updateMeeting(meeting.id, (current) => ({
      ...current,
      status: "live",
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    patch({
      meetingNote: error instanceof Error ? error.message : String(error),
    });
  } finally {
    patch({ transcriptionBusy: false });
  }
}

async function runMeetingDiarization(meetingId: string) {
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

    const result = await invoke<LocalDiarizationResult>("run_local_diarization", {
      input: { audioPath: meeting.audioPath.trim() },
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
          ? "Diarization finished, but no speaker turns were detected."
          : `Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`,
    });
  } catch (error) {
    patch({
      meetingNote: error instanceof Error ? error.message : String(error),
    });
  } finally {
    patch({ diarizationRunBusy: false });
  }
}

async function revealMeetingExportInFinder(meetingId: string) {
  const meeting = getMeeting(meetingId);
  if (!meeting) {
    return;
  }

  patch({ permissionNote: "" });

  try {
    const path = meeting.exportPath?.trim() || (await syncMeetingMarkdown(meetingId));
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
  if (
    !meeting ||
    state.transcriptionBusy ||
    state.recordingMeetingId === meetingId ||
    meeting.status === "live"
  ) {
    return;
  }

  const exportPath = meeting.exportPath?.trim() || null;
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

  if (!exportPath) {
    return;
  }

  try {
    await invoke("delete_meeting_export", { path: exportPath });
  } catch (error) {
    patch({
      permissionNote:
        error instanceof Error
          ? `Deleted the meeting, but couldn't remove its markdown file: ${error.message}`
          : `Deleted the meeting, but couldn't remove its markdown file: ${String(error)}`,
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
  } catch (error) {
    patch({
      generalNote: `Settings save failed: ${String(error)}`,
    });
  } finally {
    patch({ generalBusy: false });
  }
}

async function startManagedModelDownload() {
  if (state.modelBusy) {
    return;
  }

  patch({
    modelBusy: true,
    permissionNote: "",
  });

  try {
    const modelDownload = await invoke<ManagedModelDownloadState>("download_managed_model");
    patch({ modelDownload });
    await Promise.all([refreshManagedModelDownloadState(true), refreshModelSettings(true)]);
  } catch (error) {
    patch({
      permissionNote:
        error instanceof Error ? error.message : `Model download failed: ${String(error)}`,
    });
  } finally {
    patch({ modelBusy: false });
  }
}

function handleAppFocus() {
  void ensureWindowAlwaysOnTop();

  if (isSettingsWindow) {
    void Promise.all([
      refreshGeneralSettings(true),
      refreshManagedModelDownloadState(true),
      refreshModelSettings(true),
    ]);
    return;
  }

  void Promise.all([
    refreshGeneralSettings(true),
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

function setHomeScrollTop(homeScrollTop: number) {
  patch({ homeScrollTop });
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
    await Promise.all([ensureWindowAlwaysOnTop(), currentWindow.show(), currentWindow.setFocus()]);
    await Promise.all([
      refreshGeneralSettings(true),
      refreshManagedModelDownloadState(true),
      refreshModelSettings(true),
    ]);
    patch({ initialized: true });
    return;
  }

  void ensureWindowAlwaysOnTop();
  queueLoadedMeetingMarkdownSync();
  window.addEventListener("focus", handleAppFocus);
  await Promise.all([
    refreshGeneralSettings(true),
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
  setHomeScrollTop,
  setMainLanguage,
  setTimezone,
  addSpokenLanguage,
  removeSpokenLanguage,
  getMeetingById,
};
