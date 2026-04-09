import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type PermissionKind = "microphone" | "systemAudio";
type PermissionStatus = "neverRequested" | "authorized" | "denied";
type View = "home" | "meeting";
type MeetingStatus = "live" | "done";
type ModelSource = "bundled" | "huggingFace";

type OnboardingState = {
  productName: string;
  engine: string;
  reference: string;
  permissions: Record<PermissionKind, PermissionStatus>;
  ready: boolean;
};

type Meeting = {
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

type ModelSettings = {
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

type ModelDraft = {
  source: ModelSource;
  huggingFaceRepo: string;
  huggingFaceRevision: string;
  huggingFaceLocalPath: string;
};

type DiarizationSettings = {
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

type DiarizationDraft = {
  enabled: boolean;
  localPath: string;
  huggingFaceToken: string;
};

type DiarizationSegment = {
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
  title: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
  transcript: string;
  speakerTurns: string;
};

type LiveTranscriptionState = {
  running: boolean;
  text: string;
  error: string | null;
};

const STORE_KEY = "unsigned-char-meetings";
const isMacLike = /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
const NEW_MEETING_SHORTCUT = isMacLike ? "⌘N" : "Ctrl+N";
const SETTINGS_WINDOW_LABEL = "settings";
const currentWindow = getCurrentWindow();
const isSettingsWindow = currentWindow.label === SETTINGS_WINDOW_LABEL;
const LIVE_TRANSCRIPTION_POLL_MS = 1200;
const appRoot: HTMLElement = (() => {
  const node = document.querySelector<HTMLElement>("#app");
  if (!node) {
    throw new Error("Missing app root");
  }
  return node;
})();

const state = {
  view: "home" as View,
  onboarding: null as OnboardingState | null,
  modelSettings: null as ModelSettings | null,
  modelDraft: emptyModelDraft(),
  diarizationSettings: null as DiarizationSettings | null,
  diarizationDraft: emptyDiarizationDraft(),
  meetings: loadMeetings(),
  activeMeetingId: null as string | null,
  permissionBusy: null as PermissionKind | null,
  permissionNote: "",
  modelBusy: false,
  modelNote: "",
  diarizationBusy: false,
  diarizationNote: "",
  startMeetingBusy: false,
  transcriptionBusy: false,
  transcriptionRunning: false,
  liveTranscriptText: "",
  recordingMeetingId: null as string | null,
  diarizationRunBusy: false,
  saveBusy: false,
  meetingNote: "",
  meetingOverlayBusy: false,
  meetingOverlayEnabled: false,
  homeScrollTop: 0,
};

let liveTranscriptionPollId: number | null = null;

function emptyModelDraft(): ModelDraft {
  return {
    source: "bundled",
    huggingFaceRepo: "",
    huggingFaceRevision: "",
    huggingFaceLocalPath: "",
  };
}

function emptyDiarizationDraft(): DiarizationDraft {
  return {
    enabled: false,
    localPath: "",
    huggingFaceToken: "",
  };
}

function syncModelDraft(settings: ModelSettings) {
  state.modelDraft = {
    source: settings.source,
    huggingFaceRepo: settings.huggingFaceRepo,
    huggingFaceRevision: settings.huggingFaceRevision,
    huggingFaceLocalPath: settings.huggingFaceLocalPath,
  };
}

function syncDiarizationDraft(settings: DiarizationSettings) {
  state.diarizationDraft = {
    enabled: settings.enabled,
    localPath: settings.localPath,
    huggingFaceToken: "",
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

function persistMeetings() {
  window.localStorage.setItem(STORE_KEY, JSON.stringify(state.meetings));
}

function sortedMeetings() {
  return [...state.meetings].sort(
    (left, right) =>
      new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
  );
}

function getActiveMeeting() {
  return state.meetings.find((meeting) => meeting.id === state.activeMeetingId) ?? null;
}

function getRecordingMeeting() {
  return state.meetings.find((meeting) => meeting.id === state.recordingMeetingId) ?? null;
}

function updateMeeting(id: string, updater: (meeting: Meeting) => Meeting) {
  state.meetings = state.meetings.map((meeting) =>
    meeting.id === id ? updater(meeting) : meeting,
  );
  persistMeetings();
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

  state.meetings = [meeting, ...state.meetings];
  state.activeMeetingId = meeting.id;
  state.recordingMeetingId = meeting.id;
  state.view = "meeting";
  persistMeetings();
  render();
  return meeting;
}

function buildMeetingTitle(iso: string) {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Meeting ${datePart} ${timePart}`;
}

function normalizeMeetingTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatClockSeconds(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainder = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${remainder
    .toString()
    .padStart(2, "0")}`;
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

function handleWindowKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "n"
  ) {
    return;
  }

  const usesPrimaryModifier = isMacLike
    ? event.metaKey && !event.ctrlKey
    : event.ctrlKey && !event.metaKey;
  if (!usesPrimaryModifier) {
    return;
  }

  event.preventDefault();

  if (requiresAppSetup()) {
    void openSettingsWindow();
    return;
  }

  void startMeeting();
}

function requiresModelSetup() {
  return Boolean(state.modelSettings && !state.modelSettings.selectedReady);
}

function requiresAppSetup() {
  return requiresModelSetup();
}

function setupBannerCopy(settings: ModelSettings) {
  if (settings.source === "bundled") {
    return "Bundled Qwen3-ASR files are missing.";
  }

  return "Choose a local Hugging Face snapshot with vocab.json and safetensors files.";
}

function currentSetupBannerContent() {
  if (!requiresModelSetup() || !state.modelSettings) {
    return null;
  }

  return {
    title: "Transcription model unavailable",
    copy: setupBannerCopy(state.modelSettings),
  };
}

function meetingTranscriptLines(meeting: Meeting) {
  const lines = [...meeting.transcript];
  const liveText =
    state.recordingMeetingId === meeting.id ? state.liveTranscriptText.trim() : "";
  if (liveText) {
    lines.push(liveText);
  }

  return lines;
}

async function openSettingsWindow() {
  try {
    await invoke("open_settings_window");
  } catch (error) {
    state.permissionNote = `Failed to open settings: ${String(error)}`;
    render();
  }
}

function renderSetupBanner() {
  const content = currentSetupBannerContent();
  if (!content) {
    return "";
  }

  return `
    <button class="setup-banner" id="open-settings-banner" type="button">
      <span class="setup-banner-kicker">Setup required</span>
      <strong class="setup-banner-title">${escapeHtml(content.title)}</strong>
      <span class="setup-banner-copy">${escapeHtml(content.copy)}</span>
      <span class="setup-banner-action">Open settings</span>
    </button>
  `;
}

function renderHome() {
  const items = sortedMeetings();
  const setupBanner = renderSetupBanner();
  const startDisabled = state.startMeetingBusy || requiresAppSetup();
  const permissionNote = state.permissionNote
    ? `<p class="meta home-note">${escapeHtml(state.permissionNote)}</p>`
    : "";
  const content =
    items.length === 0
      ? `
        <div class="empty-state">
          <p class="empty-title">No meetings yet</p>
          <p class="body">
            Create a meeting from the button below and transcripts will show up here.
          </p>
        </div>
      `
      : `
        <div class="meeting-list">
          ${items
            .map((meeting) => {
              const livePreview =
                state.recordingMeetingId === meeting.id ? state.liveTranscriptText.trim() : "";
              const preview = livePreview || meeting.transcript[meeting.transcript.length - 1] || "No transcript yet";
              const lineCount = meeting.transcript.length + (livePreview ? 1 : 0);
              return `
                <button class="meeting-row" data-open-meeting="${meeting.id}" type="button">
                  <div class="meeting-row-copy">
                    <div class="meeting-row-top">
                      <h2>${escapeHtml(meeting.title)}</h2>
                      <span class="status-badge ${meeting.status}">${meeting.status}</span>
                    </div>
                    <p class="meeting-preview">${escapeHtml(preview)}</p>
                    <p class="meeting-meta">
                      ${formatDate(meeting.updatedAt)} · ${lineCount} lines
                    </p>
                  </div>
                </button>
              `;
            })
            .join("")}
        </div>
      `;

  return `
    <section class="screen home" id="home-screen">
      <header class="screen-header screen-header-row home-header">
        <button class="button primary header-action" id="new-meeting" type="button" ${
          startDisabled ? "disabled" : ""
        }>
          <span class="button-copy-with-indicator">
            <span class="recording-indicator" aria-hidden="true"></span>
            <span>${state.startMeetingBusy ? "Starting..." : "New meeting"}</span>
          </span>
          <kbd class="shortcut-hint" aria-hidden="true">${NEW_MEETING_SHORTCUT}</kbd>
        </button>
      </header>

      ${setupBanner}
      ${content}
      ${permissionNote}
      <button class="scroll-top-chip" id="scroll-home-top" type="button">
        Go to top
      </button>
    </section>
  `;
}

function renderSettingsWindow() {
  return `
    <section class="settings-shell">
      <div class="screen settings-screen">
        <section class="model-card">
          <div class="model-card-header">
            <div>
              <p class="eyebrow">Settings</p>
              <h2>No setup</h2>
            </div>
          </div>

          <p class="body">unsigned char is meant to work out of the box.</p>
          <p class="meta">Transcription uses bundled Qwen3-ASR. If something needs manual setup, that should be fixed in the build instead of here.</p>
        </section>
      </div>
    </section>
  `;
}

function renderMeetingDiarizationPanel(meeting: Meeting) {
  const settings = state.diarizationSettings;
  const diarizationEnabled = Boolean(settings?.enabled);
  const diarizationReady = Boolean(settings?.enabled && settings.ready);
  const statusLabel = !diarizationEnabled ? "off" : diarizationReady ? "ready" : "needs setup";
  const statusClass = !diarizationEnabled ? "off" : diarizationReady ? "ready" : "missing";
  const note = meeting.diarizationRanAt
    ? `${meeting.diarizationSpeakerCount} speakers across ${meeting.diarizationSegments.length} segments · ${formatDateTime(meeting.diarizationRanAt)}`
    : diarizationEnabled
      ? "Provide an audio file for this meeting and run diarization locally."
      : "Speaker diarization is not available in this build yet.";
  const helperCopy = diarizationReady
    ? "The app runs pyannote.audio locally against the file path you provide here."
    : settings?.status ?? "Speaker diarization is not ready yet.";
  const pipelineSource = meeting.diarizationPipelineSource
    ? `
      <div class="model-path-row">
        <span class="meta-label">Last pipeline source</span>
        <code>${escapeHtml(meeting.diarizationPipelineSource)}</code>
      </div>
    `
    : "";
  const segmentsMarkup =
    meeting.diarizationSegments.length === 0
      ? `
        <div class="empty-state diarization-empty">
          <p class="empty-title">No speaker turns yet</p>
          <p class="body">
            ${escapeHtml(
              meeting.audioPath
                ? "Run diarization to label speakers for the current audio file."
                : "Add an audio file path to run local diarization for this meeting.",
            )}
          </p>
        </div>
      `
      : `
        <div class="diarization-segment-list">
          ${meeting.diarizationSegments
            .map(
              (segment, index) => `
                <article class="diarization-segment">
                  <div class="diarization-segment-top">
                    <strong>${escapeHtml(segment.speaker)}</strong>
                    <span class="meta">
                      ${formatClockSeconds(segment.startSeconds)}-${formatClockSeconds(segment.endSeconds)}
                    </span>
                  </div>
                  <p class="meta">Segment ${index + 1}</p>
                </article>
              `,
            )
            .join("")}
        </div>
      `;

  return `
    <section class="meeting-panel">
      <div class="meeting-panel-header">
        <div>
          <p class="eyebrow">Diarization</p>
          <h2>Speaker turns</h2>
        </div>
        <span class="model-status ${statusClass}">
          ${escapeHtml(statusLabel)}
        </span>
      </div>

      <p class="meta">${escapeHtml(helperCopy)}</p>

      <label class="field">
        <span class="meta-label">Audio file path</span>
        <input
          id="meeting-audio-path"
          class="composer-input"
          autocomplete="off"
          placeholder="~/Recordings/meeting.wav"
          value="${escapeHtml(meeting.audioPath)}"
        />
      </label>

      <div class="meeting-actions meeting-actions-compact">
        <button class="button secondary" id="run-diarization" type="button" ${
          state.diarizationRunBusy ? "disabled" : ""
        }>
          ${state.diarizationRunBusy ? "Running..." : "Run diarization"}
        </button>
      </div>

      <p class="meta">${escapeHtml(note)}</p>
      ${pipelineSource}
      ${segmentsMarkup}
    </section>
  `;
}

function renderMeeting() {
  const meeting = getActiveMeeting();
  if (!meeting) {
    state.view = "home";
    return renderHome();
  }

  const transcriptLines = meetingTranscriptLines(meeting);
  const transcript =
    transcriptLines.length === 0
      ? `
        <div class="empty-state transcript-empty">
          <p class="empty-title">Live transcript</p>
          <p class="body">
            Start speaking and your microphone transcript will appear here.
          </p>
        </div>
      `
      : `
        <div class="transcript-list">
          ${transcriptLines
            .map(
              (line, index) => `
                <article class="transcript-line">
                  <span class="line-index">${index + 1}</span>
                  <p>${escapeHtml(line)}</p>
                </article>
              `,
            )
            .join("")}
        </div>
      `;

  return `
    <section class="screen meeting">
      <header class="meeting-header">
        <div class="meeting-nav">
          <button class="back-button" id="back-home" type="button">Back</button>
          <button
            class="button ghost meeting-overlay-toggle ${state.meetingOverlayEnabled ? "active" : ""}"
            id="toggle-meeting-overlay"
            type="button"
            aria-pressed="${state.meetingOverlayEnabled ? "true" : "false"}"
            ${state.meetingOverlayBusy ? "disabled" : ""}
          >
            ${state.meetingOverlayBusy ? "Updating..." : state.meetingOverlayEnabled ? "Overlay on" : "Overlay"}
          </button>
        </div>
        <div class="meeting-heading">
          <p class="eyebrow">Meeting</p>
          <h1 class="meeting-title">
            <input
              id="meeting-title-input"
              class="meeting-title-input"
              type="text"
              value="${escapeHtml(meeting.title)}"
              aria-label="Meeting title"
              spellcheck="false"
            />
          </h1>
          <p class="meeting-subtitle">
            <span class="status-badge ${meeting.status}">${meeting.status}</span>
            <span>${formatTime(meeting.createdAt)}</span>
          </p>
        </div>
      </header>

      <div class="meeting-actions">
        <button class="button ghost" id="toggle-meeting-status" type="button" ${
          state.transcriptionBusy ? "disabled" : ""
        }>
          ${
            meeting.status === "live"
              ? "End live"
              : `
                <span class="button-copy-with-indicator">
                  <span class="recording-indicator" aria-hidden="true"></span>
                  <span>Resume listening</span>
                </span>
              `
          }
        </button>
        <button class="button secondary" id="save-markdown" type="button" ${
          state.saveBusy ? "disabled" : ""
        }>
          ${state.saveBusy ? "Saving..." : "Save .md"}
        </button>
      </div>

      <p class="meta meeting-runtime">
        ${
          meeting.status === "live"
            ? state.transcriptionRunning
              ? "Listening on your microphone and transcribing locally."
              : "Starting local microphone transcription..."
            : "Meeting transcription is paused."
        }
      </p>

      <section class="transcript-panel" id="transcript-panel">
        ${transcript}
      </section>

      ${renderMeetingDiarizationPanel(meeting)}

      <p class="meta meeting-note">${escapeHtml(state.meetingNote || meeting.exportPath || "")}</p>
    </section>
  `;
}

function render() {
  const markup = isSettingsWindow
    ? renderSettingsWindow()
    : state.view === "home"
      ? renderHome()
      : renderMeeting();

  appRoot.innerHTML = markup;
  syncMeetingOverlayAppearance();
  bindViewHandlers();
  syncLiveTranscriptionPolling();

  if (!isSettingsWindow && state.view === "home") {
    const homeScreen = document.querySelector<HTMLElement>("#home-screen");
    if (homeScreen) {
      homeScreen.scrollTop = state.homeScrollTop;
    }
    updateHomeScrollChip();
    return;
  }

  if (!isSettingsWindow && state.view === "meeting") {
    const panel = document.querySelector<HTMLElement>("#transcript-panel");
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  }
}

function syncMeetingOverlayAppearance() {
  document.body.dataset.meetingOverlay =
    !isSettingsWindow && state.view === "meeting" && state.meetingOverlayEnabled ? "on" : "off";
}

async function setMeetingOverlayEnabled(enabled: boolean) {
  if (isSettingsWindow || state.meetingOverlayEnabled === enabled) {
    syncMeetingOverlayAppearance();
    return;
  }

  await currentWindow.setAlwaysOnTop(enabled);
  state.meetingOverlayEnabled = enabled;
  syncMeetingOverlayAppearance();
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

function finalizeLiveTranscript(markDone = false) {
  const meeting = getRecordingMeeting();
  const text = state.liveTranscriptText.trim();

  if (!meeting) {
    state.liveTranscriptText = "";
    state.recordingMeetingId = null;
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

  state.liveTranscriptText = "";
  state.recordingMeetingId = null;
}

async function refreshLiveTranscription(silent = false) {
  try {
    const snapshot = await invoke<LiveTranscriptionState>("live_transcription_state");
    const wasRunning = state.transcriptionRunning;

    state.transcriptionRunning = snapshot.running;
    state.liveTranscriptText = snapshot.text.trim();

    if (snapshot.error) {
      state.meetingNote = snapshot.error;
    }

    if (wasRunning && !snapshot.running) {
      finalizeLiveTranscript(true);
    }
  } catch (error) {
    if (!silent) {
      state.meetingNote = `Live transcription failed: ${String(error)}`;
    }
    state.transcriptionRunning = false;
  } finally {
    state.transcriptionBusy = false;
    syncLiveTranscriptionPolling();
    if (!silent) {
      render();
    }
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

  state.recordingMeetingId = meetingId;
  state.transcriptionRunning = snapshot.running;
  state.liveTranscriptText = snapshot.text.trim();
  syncLiveTranscriptionPolling();
}

async function stopLiveTranscriptionSession() {
  const snapshot = await invoke<LiveTranscriptionState>("stop_live_transcription");

  state.transcriptionRunning = snapshot.running;
  state.liveTranscriptText = snapshot.text.trim();

  if (snapshot.error) {
    state.meetingNote = snapshot.error;
  }

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

function updateHomeScrollChip() {
  const homeScreen = document.querySelector<HTMLElement>("#home-screen");
  const newMeetingButton = document.querySelector<HTMLElement>("#new-meeting");
  const chip = document.querySelector<HTMLButtonElement>("#scroll-home-top");
  if (!homeScreen || !newMeetingButton || !chip) {
    return;
  }

  const threshold = newMeetingButton.offsetTop + newMeetingButton.offsetHeight;
  chip.classList.toggle("visible", homeScreen.scrollTop > threshold);
}

function bindViewHandlers() {
  if (isSettingsWindow) {
    return;
  }

  if (state.view === "home") {
    const homeScreen = document.querySelector<HTMLElement>("#home-screen");
    const syncHomeScroll = () => {
      if (!homeScreen) {
        return;
      }

      state.homeScrollTop = homeScreen.scrollTop;
      updateHomeScrollChip();
    };

    homeScreen?.addEventListener("scroll", syncHomeScroll, { passive: true });

    document.querySelector<HTMLButtonElement>("#new-meeting")?.addEventListener("click", () => {
      void startMeeting();
    });

    document
      .querySelector<HTMLButtonElement>("#open-settings-banner")
      ?.addEventListener("click", () => {
        void openSettingsWindow();
      });

    document.querySelector<HTMLButtonElement>("#scroll-home-top")?.addEventListener("click", () => {
      homeScreen?.scrollTo({ top: 0, behavior: "smooth" });
    });

    document.querySelectorAll<HTMLElement>("[data-open-meeting]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.openMeeting;
        if (!id) {
          return;
        }

        state.activeMeetingId = id;
        state.meetingNote = "";
        state.view = "meeting";
        render();
      });
    });
    return;
  }

  const meeting = getActiveMeeting();
  if (!meeting) {
    return;
  }

  document.querySelector<HTMLButtonElement>("#back-home")?.addEventListener("click", async () => {
    if (state.meetingOverlayEnabled) {
      try {
        await setMeetingOverlayEnabled(false);
      } catch (error) {
        state.meetingNote =
          error instanceof Error
            ? `Failed to disable overlay: ${error.message}`
            : `Failed to disable overlay: ${String(error)}`;
        render();
        return;
      }
    }

    state.activeMeetingId = null;
    state.view = "home";
    render();
  });

  document
    .querySelector<HTMLButtonElement>("#toggle-meeting-overlay")
    ?.addEventListener("click", async () => {
      if (state.meetingOverlayBusy) {
        return;
      }

      state.meetingOverlayBusy = true;
      state.meetingNote = "";
      render();

      try {
        await setMeetingOverlayEnabled(!state.meetingOverlayEnabled);
      } catch (error) {
        state.meetingNote =
          error instanceof Error
            ? `Overlay toggle failed: ${error.message}`
            : `Overlay toggle failed: ${String(error)}`;
      } finally {
        state.meetingOverlayBusy = false;
        render();
      }
    });

  document
    .querySelector<HTMLButtonElement>("#toggle-meeting-status")
    ?.addEventListener("click", async () => {
      if (state.transcriptionBusy) {
        return;
      }

      state.transcriptionBusy = true;
      state.meetingNote = "";
      render();

      try {
        if (meeting.status === "live") {
          await stopLiveTranscriptionSession();
          updateMeeting(meeting.id, (current) => ({
            ...current,
            status: "done",
            updatedAt: new Date().toISOString(),
          }));
        } else {
          await ensureModelReady();
          await requestPermissionForMeeting("microphone");
          await stopActiveRecordingIfNeeded(meeting.id);
          await startLiveTranscriptionSession(meeting.id);
          updateMeeting(meeting.id, (current) => ({
            ...current,
            status: "live",
            updatedAt: new Date().toISOString(),
          }));
        }
      } catch (error) {
        state.meetingNote = error instanceof Error ? error.message : String(error);
      } finally {
        state.transcriptionBusy = false;
        render();
      }
    });

  document.querySelector<HTMLButtonElement>("#save-markdown")?.addEventListener("click", () => {
    const currentMeeting = getActiveMeeting();
    if (!currentMeeting) {
      return;
    }

    void saveMeetingAsMarkdown(currentMeeting);
  });

  const titleInput = document.querySelector<HTMLInputElement>("#meeting-title-input");
  const commitTitle = () => {
    const currentMeeting = getActiveMeeting();
    if (!titleInput || !currentMeeting) {
      return;
    }

    const title = normalizeMeetingTitle(titleInput.value);
    if (!title) {
      titleInput.value = currentMeeting.title;
      return;
    }

    if (title === currentMeeting.title) {
      titleInput.value = currentMeeting.title;
      return;
    }

    updateMeeting(currentMeeting.id, (current) => ({
      ...current,
      title,
      updatedAt: new Date().toISOString(),
    }));
    titleInput.value = title;
  };

  titleInput?.addEventListener("change", commitTitle);
  titleInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      titleInput.blur();
      return;
    }

    if (event.key !== "Escape") {
      return;
    }

    const currentMeeting = getActiveMeeting();
    if (!currentMeeting) {
      return;
    }

    event.preventDefault();
    titleInput.value = currentMeeting.title;
    titleInput.blur();
  });

  document
    .querySelector<HTMLInputElement>("#meeting-audio-path")
    ?.addEventListener("input", (event) => {
      const value = (event.currentTarget as HTMLInputElement).value;
      updateMeeting(meeting.id, (current) => ({
        ...current,
        audioPath: value,
        updatedAt: current.updatedAt,
      }));
    });

  document
    .querySelector<HTMLButtonElement>("#run-diarization")
    ?.addEventListener("click", () => {
      void runMeetingDiarization();
    });
}

async function refreshPermissions(silent = false) {
  try {
    const onboarding = await invoke<OnboardingState>("onboarding_state");
    state.onboarding = onboarding;
  } catch (error) {
    if (!silent) {
      state.permissionNote = `Failed to load permissions: ${String(error)}`;
    }
  }

  render();
}

async function refreshModelSettings(silent = false) {
  try {
    const settings = await invoke<ModelSettings>("model_settings_state");
    state.modelSettings = settings;
    syncModelDraft(settings);
  } catch (error) {
    if (!silent) {
      state.modelNote = `Failed to load model settings: ${String(error)}`;
    }
  }

  render();
}

async function refreshDiarizationSettings(silent = false) {
  try {
    const settings = await invoke<DiarizationSettings>("diarization_settings_state");
    state.diarizationSettings = settings;
    syncDiarizationDraft(settings);
  } catch (error) {
    if (!silent) {
      state.diarizationNote = `Failed to load diarization settings: ${String(error)}`;
    }
  }

  render();
}

async function requestPermissionForMeeting(permission: PermissionKind) {
  await refreshPermissions(true);
  const status = state.onboarding?.permissions[permission];
  if (!status || status === "authorized") {
    return;
  }

  state.permissionBusy = permission;
  render();

  try {
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
  } finally {
    state.permissionBusy = null;
    render();
  }
}

async function startMeeting() {
  if (state.startMeetingBusy) {
    return;
  }

  state.startMeetingBusy = true;
  state.permissionNote = "";
  render();

  try {
    await ensureModelReady();
    await requestPermissionForMeeting("microphone");
    await stopActiveRecordingIfNeeded();
    state.transcriptionBusy = true;
    render();
    await startLiveTranscriptionSession(null);
    const meeting = createMeeting();
    state.recordingMeetingId = meeting.id;
  } catch (error) {
    state.permissionNote = error instanceof Error ? error.message : String(error);
    render();
  } finally {
    state.transcriptionBusy = false;
    state.startMeetingBusy = false;
    render();
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

async function runMeetingDiarization() {
  const meeting = getActiveMeeting();
  if (!meeting || state.diarizationRunBusy) {
    return;
  }

  const audioPathInput = document.querySelector<HTMLInputElement>("#meeting-audio-path");
  const audioPath = audioPathInput?.value.trim() ?? meeting.audioPath.trim();

  updateMeeting(meeting.id, (current) => ({
    ...current,
    audioPath,
    updatedAt: current.updatedAt,
  }));

  state.diarizationRunBusy = true;
  state.meetingNote = "";
  render();

  try {
    await ensureDiarizationReady();

    const result = await invoke<LocalDiarizationResult>("run_local_diarization", {
      input: { audioPath },
    });

    updateMeeting(meeting.id, (current) => ({
      ...current,
      audioPath: result.audioPath,
      diarizationSegments: result.segments,
      diarizationSpeakerCount: result.speakerCount,
      diarizationPipelineSource: result.pipelineSource,
      diarizationRanAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    state.meetingNote =
      result.segments.length === 0
        ? "Diarization finished, but no speaker turns were detected."
        : `Detected ${result.speakerCount} speakers across ${result.segments.length} segments.`;
  } catch (error) {
    state.meetingNote = error instanceof Error ? error.message : String(error);
  } finally {
    state.diarizationRunBusy = false;
    render();
  }
}

async function saveMeetingAsMarkdown(meeting: Meeting) {
  if (state.saveBusy) {
    return;
  }

  state.saveBusy = true;
  state.meetingNote = "";
  render();

  const exportPayload: MarkdownExport = {
    title: meeting.title,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    status: meeting.status,
    transcript: meetingTranscriptLines(meeting).join("\n\n"),
    speakerTurns: formatSpeakerTurnsMarkdown(meeting),
  };

  try {
    const path = await invoke<string>("save_meeting_markdown", { export: exportPayload });
    updateMeeting(meeting.id, (current) => ({
      ...current,
      exportPath: path,
      updatedAt: new Date().toISOString(),
    }));
    state.meetingNote = `Saved to ${path}`;
  } catch (error) {
    state.meetingNote = `Save failed: ${String(error)}`;
  } finally {
    state.saveBusy = false;
    render();
  }
}

function handleAppFocus() {
  if (isSettingsWindow) {
    return;
  }

  void Promise.all([
    refreshPermissions(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]);
}

window.addEventListener("DOMContentLoaded", async () => {
  render();
  if (isSettingsWindow) {
    await Promise.all([refreshModelSettings(true), refreshDiarizationSettings(true)]);
    return;
  }

  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("focus", handleAppFocus);
  await Promise.all([
    refreshPermissions(true),
    refreshModelSettings(true),
    refreshDiarizationSettings(true),
  ]);
});
