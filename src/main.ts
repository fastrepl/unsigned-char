import { invoke } from "@tauri-apps/api/core";

type PermissionKind = "microphone" | "systemAudio";
type PermissionStatus = "neverRequested" | "authorized" | "denied";
type View = "home" | "meeting";
type MeetingStatus = "live" | "done";

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

const STORE_KEY = "unsigned-char-meetings";
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
  meetings: loadMeetings(),
  activeMeetingId: null as string | null,
  permissionBusy: null as PermissionKind | null,
  permissionNote: "",
  startMeetingBusy: false,
  saveBusy: false,
  meetingNote: "",
};

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
    !event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== "n"
  ) {
    return;
  }

  event.preventDefault();
  void startMeeting();
}

function renderHome() {
  const items = sortedMeetings();
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
    <section class="screen home">
      <header class="screen-header screen-header-row">
        <div class="screen-header-copy">
          <h1>Meetings</h1>
        </div>
        <button class="button primary header-action" id="new-meeting" type="button">
          ${state.startMeetingBusy ? "Starting..." : "New meeting"}
        </button>
      </header>

      ${content}
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
          <h1>${escapeHtml(meeting.title)}</h1>
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
  const markup = state.view === "home" ? renderHome() : renderMeeting();

  appRoot.innerHTML = markup;
  bindViewHandlers();

  if (state.view === "meeting") {
    const panel = document.querySelector<HTMLElement>("#transcript-panel");
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
    }
  }
}

function bindViewHandlers() {
  if (state.view === "home") {
    document.querySelector<HTMLButtonElement>("#new-meeting")?.addEventListener("click", () => {
      void startMeeting();
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
      void saveMeetingAsMarkdown(meeting);
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

window.addEventListener("DOMContentLoaded", async () => {
  window.addEventListener("keydown", handleWindowKeydown);
  await refreshPermissions();
});
