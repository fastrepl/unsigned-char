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
  exportPath: string | null;
};

type MarkdownExport = {
  title: string;
  createdAt: string;
  updatedAt: string;
  status: MeetingStatus;
  transcript: string;
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

const STORE_KEY = "unsigned-char-meetings";
const isMacLike = /Mac|iPhone|iPad|iPod/.test(window.navigator.userAgent);
const NEW_MEETING_SHORTCUT = isMacLike ? "⌘N" : "Ctrl+N";
const SETTINGS_WINDOW_LABEL = "settings";
const isSettingsWindow = getCurrentWindow().label === SETTINGS_WINDOW_LABEL;
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
  meetings: loadMeetings(),
  activeMeetingId: null as string | null,
  permissionBusy: null as PermissionKind | null,
  permissionNote: "",
  modelBusy: false,
  modelNote: "",
  startMeetingBusy: false,
  saveBusy: false,
  meetingNote: "",
  homeScrollTop: 0,
};

function emptyModelDraft(): ModelDraft {
  return {
    source: "bundled",
    huggingFaceRepo: "",
    huggingFaceRevision: "",
    huggingFaceLocalPath: "",
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

    return parsed.filter(isMeeting);
  } catch {
    return [];
  }
}

function isMeeting(value: unknown): value is Meeting {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.createdAt === "string" &&
    typeof candidate.updatedAt === "string" &&
    (candidate.status === "live" || candidate.status === "done") &&
    Array.isArray(candidate.transcript) &&
    (typeof candidate.exportPath === "string" || candidate.exportPath === null)
  );
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
    exportPath: null,
  };

  state.meetings = [meeting, ...state.meetings];
  state.activeMeetingId = meeting.id;
  state.view = "meeting";
  state.meetingNote = "";
  persistMeetings();
  render();
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

  if (requiresModelSetup()) {
    void openSettingsWindow();
    return;
  }

  void startMeeting();
}

function requiresModelSetup() {
  return Boolean(state.modelSettings && !state.modelSettings.selectedReady);
}

function setupBannerCopy(settings: ModelSettings) {
  if (settings.source === "bundled") {
    return "Bundled Qwen ASR is missing.";
  }

  return "Pick a local Hugging Face snapshot.";
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
  if (!state.modelSettings || state.modelSettings.selectedReady) {
    return "";
  }

  return `
    <button class="setup-banner" id="open-settings-banner" type="button">
      <span class="setup-banner-kicker">Setup required</span>
      <strong class="setup-banner-title">Transcription model unavailable</strong>
      <span class="setup-banner-copy">${escapeHtml(setupBannerCopy(state.modelSettings))}</span>
      <span class="setup-banner-action">Open settings</span>
    </button>
  `;
}

function renderHome() {
  const items = sortedMeetings();
  const setupBanner = renderSetupBanner();
  const startDisabled = state.startMeetingBusy || requiresModelSetup();
  const note = state.permissionNote
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
              const preview = meeting.transcript[meeting.transcript.length - 1] ?? "No transcript yet";
              return `
                <button class="meeting-row" data-open-meeting="${meeting.id}" type="button">
                  <div class="meeting-row-copy">
                    <div class="meeting-row-top">
                      <h2>${escapeHtml(meeting.title)}</h2>
                      <span class="status-badge ${meeting.status}">${meeting.status}</span>
                    </div>
                    <p class="meeting-preview">${escapeHtml(preview)}</p>
                    <p class="meeting-meta">
                      ${formatDate(meeting.updatedAt)} · ${meeting.transcript.length} lines
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
          <span>${state.startMeetingBusy ? "Starting..." : "New meeting"}</span>
          <kbd class="shortcut-hint" aria-hidden="true">${NEW_MEETING_SHORTCUT}</kbd>
        </button>
      </header>

      ${setupBanner}
      ${content}
      ${note}
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
        <header class="screen-header screen-header-copy">
          <p class="eyebrow">Settings</p>
          <h1>Transcription</h1>
          <p class="body">
            Choose the bundled Qwen ASR model or point the app at a local Hugging Face snapshot.
          </p>
        </header>

        ${renderModelSection()}
      </div>
    </section>
  `;
}

function renderModelSection() {
  if (!state.modelSettings) {
    return `
      <section class="model-card">
        <div class="model-card-header">
          <div>
            <p class="eyebrow">Model</p>
            <h2>Transcription model</h2>
          </div>
        </div>
        <p class="meta">Loading model settings...</p>
      </section>
    `;
  }

  const settings = state.modelSettings;
  const draft = state.modelDraft;
  const pendingStatus =
    draft.source === "bundled" ? settings.bundledStatus : settings.huggingFaceStatus;
  const note = state.modelNote
    ? `<p class="meta model-note">${escapeHtml(state.modelNote)}</p>`
    : "";

  return `
    <section class="model-card">
      <div class="model-card-header">
        <div>
          <p class="eyebrow">Model</p>
          <h2>Transcription model</h2>
        </div>
        <span class="model-status ${settings.selectedReady ? "ready" : "missing"}">
          ${settings.selectedReady ? "ready" : "needs setup"}
        </span>
      </div>

      <p class="meta">
        Packaged builds resolve the default Qwen ASR model from the app bundle. Save changes to switch the app to a local Hugging Face snapshot.
      </p>

      <div class="model-source-grid">
        <label class="model-source-option">
          <input type="radio" name="model-source" value="bundled" ${
            draft.source === "bundled" ? "checked" : ""
          } />
          <span>
            <strong>${escapeHtml(settings.bundledLabel)}</strong>
            <small>${escapeHtml(settings.bundledStatus)}</small>
          </span>
        </label>

        <label class="model-source-option">
          <input type="radio" name="model-source" value="huggingFace" ${
            draft.source === "huggingFace" ? "checked" : ""
          } />
          <span>
            <strong>Hugging Face</strong>
            <small>${escapeHtml(settings.huggingFaceStatus)}</small>
          </span>
        </label>
      </div>

      <div class="model-path-row">
        <span class="meta-label">Bundled path</span>
        <code>${escapeHtml(settings.bundledResolvedPath)}</code>
      </div>

      <label class="field">
        <span class="meta-label">Hugging Face repo or URL</span>
        <input
          id="hf-repo"
          class="composer-input"
          autocomplete="off"
          placeholder="Qwen/Qwen2-Audio-7B-Instruct"
          value="${escapeHtml(draft.huggingFaceRepo)}"
        />
      </label>

      <div class="field-row">
        <label class="field">
          <span class="meta-label">Revision</span>
          <input
            id="hf-revision"
            class="composer-input"
            autocomplete="off"
            placeholder="main"
            value="${escapeHtml(draft.huggingFaceRevision)}"
          />
        </label>

        <label class="field field-wide">
          <span class="meta-label">Local snapshot path</span>
          <input
            id="hf-local-path"
            class="composer-input"
            autocomplete="off"
            placeholder="~/models/qwen-asr"
            value="${escapeHtml(draft.huggingFaceLocalPath)}"
          />
        </label>
      </div>

      <div class="model-footer">
        <p class="meta">${escapeHtml(pendingStatus)}</p>
        <button class="button secondary" id="save-model-settings" type="button" ${
          state.modelBusy ? "disabled" : ""
        }>
          ${state.modelBusy ? "Saving..." : "Save model"}
        </button>
      </div>

      ${note}
    </section>
  `;
}

function renderMeeting() {
  const meeting = getActiveMeeting();
  if (!meeting) {
    state.view = "home";
    return renderHome();
  }

  const transcript =
    meeting.transcript.length === 0
      ? `
        <div class="empty-state transcript-empty">
          <p class="empty-title">Live transcript</p>
          <p class="body">
            Transcript lines will appear here. For now, use the input below to simulate live text.
          </p>
        </div>
      `
      : `
        <div class="transcript-list">
          ${meeting.transcript
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

  const note = state.meetingNote || meeting.exportPath || "";

  return `
    <section class="screen meeting">
      <header class="meeting-header">
        <button class="back-button" id="back-home" type="button">Back</button>
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
        <button class="button ghost" id="toggle-meeting-status" type="button">
          ${meeting.status === "live" ? "End live" : "Resume"}
        </button>
        <button class="button secondary" id="save-markdown" type="button" ${
          state.saveBusy ? "disabled" : ""
        }>
          ${state.saveBusy ? "Saving..." : "Save .md"}
        </button>
      </div>

      <section class="transcript-panel" id="transcript-panel">
        ${transcript}
      </section>

      <form class="composer" id="transcript-form">
        <input
          id="transcript-input"
          class="composer-input"
          name="line"
          autocomplete="off"
          placeholder="Add a transcript line"
        />
        <button class="button primary" type="submit">Add</button>
      </form>

      <p class="meta meeting-note">${escapeHtml(note)}</p>
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
  bindViewHandlers();

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
    bindModelSettingsHandlers();
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

  document.querySelector<HTMLButtonElement>("#back-home")?.addEventListener("click", () => {
    state.activeMeetingId = null;
    state.meetingNote = "";
    state.view = "home";
    render();
  });

  document
    .querySelector<HTMLButtonElement>("#toggle-meeting-status")
    ?.addEventListener("click", () => {
      updateMeeting(meeting.id, (current) => ({
        ...current,
        status: current.status === "live" ? "done" : "live",
        updatedAt: new Date().toISOString(),
      }));
      state.meetingNote = "";
      render();
    });

  document
    .querySelector<HTMLButtonElement>("#save-markdown")
    ?.addEventListener("click", () => {
      const currentMeeting = getActiveMeeting();
      if (!currentMeeting) {
        return;
      }

      void saveMeetingAsMarkdown(currentMeeting);
    });

  document
    .querySelector<HTMLFormElement>("#transcript-form")
    ?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = document.querySelector<HTMLInputElement>("#transcript-input");
      const line = input?.value.trim() ?? "";
      if (!line) {
        return;
      }

      updateMeeting(meeting.id, (current) => ({
        ...current,
        transcript: [...current.transcript, line],
        updatedAt: new Date().toISOString(),
      }));
      state.meetingNote = "";
      render();
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
}

function bindModelSettingsHandlers() {
  document
    .querySelectorAll<HTMLInputElement>('input[name="model-source"]')
    .forEach((input) => {
      input.addEventListener("change", () => {
        state.modelDraft.source = input.value === "huggingFace" ? "huggingFace" : "bundled";
        state.modelNote = "";
        render();
      });
    });

  document.querySelector<HTMLInputElement>("#hf-repo")?.addEventListener("input", (event) => {
    state.modelDraft.huggingFaceRepo = (event.currentTarget as HTMLInputElement).value;
    state.modelNote = "";
  });

  document
    .querySelector<HTMLInputElement>("#hf-revision")
    ?.addEventListener("input", (event) => {
      state.modelDraft.huggingFaceRevision = (event.currentTarget as HTMLInputElement).value;
      state.modelNote = "";
    });

  document
    .querySelector<HTMLInputElement>("#hf-local-path")
    ?.addEventListener("input", (event) => {
      state.modelDraft.huggingFaceLocalPath = (event.currentTarget as HTMLInputElement).value;
      state.modelNote = "";
    });

  document
    .querySelector<HTMLButtonElement>("#save-model-settings")
    ?.addEventListener("click", () => {
      void saveModelSettings();
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
    await requestPermissionForMeeting("systemAudio");
    createMeeting();
  } catch (error) {
    state.permissionNote = error instanceof Error ? error.message : String(error);
    render();
  } finally {
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

async function saveModelSettings() {
  if (state.modelBusy) {
    return;
  }

  state.modelBusy = true;
  state.modelNote = "";
  render();

  try {
    const settings = await invoke<ModelSettings>("save_model_settings", {
      settings: {
        source: state.modelDraft.source,
        huggingFaceRepo: state.modelDraft.huggingFaceRepo,
        huggingFaceRevision: state.modelDraft.huggingFaceRevision,
        huggingFaceLocalPath: state.modelDraft.huggingFaceLocalPath,
      },
    });

    state.modelSettings = settings;
    syncModelDraft(settings);
    state.modelNote = settings.selectedReady
      ? `Saved. Using ${settings.selectedReference ?? "the selected model"}.`
      : "Saved, but the selected model is not ready yet.";
  } catch (error) {
    state.modelNote = `Model save failed: ${String(error)}`;
  } finally {
    state.modelBusy = false;
    render();
  }
}

async function saveMeetingAsMarkdown(meeting: Meeting) {
  state.saveBusy = true;
  state.meetingNote = "";
  render();

  const exportPayload: MarkdownExport = {
    title: meeting.title,
    createdAt: meeting.createdAt,
    updatedAt: meeting.updatedAt,
    status: meeting.status,
    transcript: meeting.transcript.join("\n\n"),
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

  void Promise.all([refreshPermissions(true), refreshModelSettings(true)]);
}

window.addEventListener("DOMContentLoaded", async () => {
  render();
  if (isSettingsWindow) {
    await refreshModelSettings(true);
    return;
  }

  window.addEventListener("keydown", handleWindowKeydown);
  window.addEventListener("focus", handleAppFocus);
  await Promise.all([refreshPermissions(true), refreshModelSettings(true)]);
});
