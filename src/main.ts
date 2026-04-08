import { invoke } from "@tauri-apps/api/core";

type SourceKey = "mic" | "system";
type PermissionKind = "microphone" | "systemAudio";
type PermissionStatus = "neverRequested" | "authorized" | "denied";

type OnboardingState = {
  productName: string;
  engine: string;
  reference: string;
  permissions: Record<PermissionKind, PermissionStatus>;
  ready: boolean;
};

type PermissionCopy = {
  badge: string;
  enableTitle: string;
  readyTitle: string;
  enableBody: string;
  readyBody: string;
};

const permissionOrder: PermissionKind[] = ["microphone", "systemAudio"];

const permissionCopy: Record<PermissionKind, PermissionCopy> = {
  microphone: {
    badge: "Mic",
    enableTitle: "Allow microphone access",
    readyTitle: "unsigned char can hear your voice",
    enableBody: "Help unsigned char hear your side of the meeting.",
    readyBody: "Microphone access turned on.",
  },
  systemAudio: {
    badge: "Sys",
    enableTitle: "Allow system audio access",
    readyTitle: "unsigned char can hear everyone else",
    enableBody: "Help unsigned char hear the meeting audio coming through your Mac.",
    readyBody: "System audio access turned on.",
  },
};

const state = {
  running: false,
  activeSources: new Set<SourceKey>(["mic", "system"]),
  onboarding: null as OnboardingState | null,
  refreshInterval: 0 as number | undefined,
  permissionBusy: new Set<PermissionKind>(),
};

function setText(selector: string, value: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) {
    element.textContent = value;
  }
}

function updateSourceSummary() {
  const summary = document.querySelector<HTMLElement>("#source-summary");
  if (!summary) {
    return;
  }

  const active = [...state.activeSources];
  if (active.length === 0) {
    summary.textContent = "Selected: none. Pick at least one source before recording.";
    return;
  }

  const labels = active.map((source) =>
    source === "mic" ? "microphone" : "system audio",
  );
  summary.textContent = `Selected: ${labels.join(" and ")}`;
}

function updateSessionState() {
  const sessionState = document.querySelector<HTMLElement>("#session-state");
  const sessionNote = document.querySelector<HTMLElement>("#session-note");
  const toggle = document.querySelector<HTMLButtonElement>("#session-toggle");
  const stages = document.querySelectorAll<HTMLElement>("[data-stage]");

  if (!sessionState || !sessionNote || !toggle) {
    return;
  }

  if (state.running) {
    sessionState.textContent = "Local session running";
    sessionNote.textContent =
      "Permissions are ready. The next step is wiring real audio capture and transcript streaming.";
    toggle.textContent = "Stop simulated session";
  } else {
    sessionState.textContent = "Permissions ready";
    sessionNote.textContent =
      "The app is unlocked. Native capture and Qwen ASR still need to be wired in.";
    toggle.textContent = "Simulate local session";
  }

  stages.forEach((stage, index) => {
    const isActive = state.running || index === 0;
    stage.classList.toggle("is-active", isActive);
  });
}

function bindSourceChips() {
  const chips = document.querySelectorAll<HTMLButtonElement>("[data-source]");

  chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const source = chip.dataset.source as SourceKey | undefined;
      if (!source) {
        return;
      }

      if (state.activeSources.has(source) && state.activeSources.size > 1) {
        state.activeSources.delete(source);
      } else {
        state.activeSources.add(source);
      }

      chip.classList.toggle("is-active", state.activeSources.has(source));
      updateSourceSummary();
    });
  });
}

function startPermissionPolling() {
  if (state.refreshInterval) {
    return;
  }

  state.refreshInterval = window.setInterval(() => {
    void refreshOnboarding(true);
  }, 2000);
}

function stopPermissionPolling() {
  if (!state.refreshInterval) {
    return;
  }

  window.clearInterval(state.refreshInterval);
  state.refreshInterval = undefined;
}

function updatePermissionCard(permission: PermissionKind, status: PermissionStatus) {
  const card = document.querySelector<HTMLElement>(`[data-permission-card="${permission}"]`);
  const title = document.querySelector<HTMLElement>(`[data-permission-title="${permission}"]`);
  const body = document.querySelector<HTMLElement>(`[data-permission-body="${permission}"]`);
  const statusLabel = document.querySelector<HTMLElement>(
    `[data-permission-status="${permission}"]`,
  );
  const button = document.querySelector<HTMLButtonElement>(
    `[data-permission-action="${permission}"]`,
  );

  if (!card || !title || !body || !statusLabel || !button) {
    return;
  }

  const copy = permissionCopy[permission];
  const isAuthorized = status === "authorized";
  const isDenied = status === "denied";
  const isBusy = state.permissionBusy.has(permission);

  title.textContent = isAuthorized ? copy.readyTitle : copy.enableTitle;
  body.textContent = isAuthorized ? copy.readyBody : copy.enableBody;
  statusLabel.textContent = isAuthorized
    ? "Granted"
    : isDenied
      ? "Needs settings"
      : "Not requested";

  button.textContent = isAuthorized
    ? "Granted"
    : isBusy
      ? "Working..."
      : isDenied
        ? "Open settings"
        : "Allow access";
  button.disabled = isAuthorized || isBusy;

  card.classList.toggle("is-authorized", isAuthorized);
  card.classList.toggle("is-denied", isDenied);
}

function updateGateNote(snapshot: OnboardingState) {
  const blocked = permissionOrder.filter(
    (permission) => snapshot.permissions[permission] !== "authorized",
  );

  if (blocked.length === 0) {
    setText("#gate-note", "All permissions granted. Unlocking the app.");
    return;
  }

  if (blocked.some((permission) => snapshot.permissions[permission] === "denied")) {
    setText(
      "#gate-note",
      "At least one permission was denied. Open System Settings, enable it, then come back or press refresh.",
    );
    return;
  }

  setText(
    "#gate-note",
    "unsigned char stays locked until both microphone and system audio access are granted.",
  );
}

function renderOnboarding(snapshot: OnboardingState) {
  state.onboarding = snapshot;

  document.title = snapshot.productName;
  setText("#engine-name", snapshot.engine);
  setText("#reference-engine", snapshot.engine);
  setText("#reference-path", snapshot.reference);

  permissionOrder.forEach((permission) => {
    updatePermissionCard(permission, snapshot.permissions[permission]);
  });
  updateGateNote(snapshot);

  const onboardingView = document.querySelector<HTMLElement>("#onboarding-view");
  const workspaceView = document.querySelector<HTMLElement>("#workspace-view");

  if (onboardingView && workspaceView) {
    onboardingView.classList.toggle("is-hidden", snapshot.ready);
    workspaceView.classList.toggle("is-hidden", !snapshot.ready);
  }

  if (snapshot.ready) {
    stopPermissionPolling();
    updateSessionState();
  } else {
    startPermissionPolling();
  }
}

async function refreshOnboarding(silent = false) {
  try {
    const snapshot = await invoke<OnboardingState>("onboarding_state");
    renderOnboarding(snapshot);
  } catch (error) {
    if (!silent) {
      setText("#gate-note", `Failed to load permissions: ${String(error)}`);
    }
  }
}

async function handlePermissionAction(permission: PermissionKind) {
  if (!state.onboarding) {
    return;
  }

  const currentStatus = state.onboarding.permissions[permission];
  state.permissionBusy.add(permission);
  updatePermissionCard(permission, currentStatus);

  try {
    if (currentStatus === "denied") {
      await invoke("open_permission_settings", { permission });
    } else {
      await invoke<PermissionStatus>("request_permission", { permission });
    }

    await refreshOnboarding(true);
  } catch (error) {
    setText("#gate-note", `Permission flow failed: ${String(error)}`);
  } finally {
    state.permissionBusy.delete(permission);
    if (state.onboarding) {
      updatePermissionCard(permission, state.onboarding.permissions[permission]);
    }
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  bindSourceChips();
  updateSourceSummary();
  updateSessionState();

  document
    .querySelector<HTMLButtonElement>("#session-toggle")
    ?.addEventListener("click", () => {
      state.running = !state.running;
      updateSessionState();
    });

  document
    .querySelector<HTMLButtonElement>("#refresh-permissions")
    ?.addEventListener("click", () => {
      void refreshOnboarding();
    });

  permissionOrder.forEach((permission) => {
    document
      .querySelector<HTMLButtonElement>(`[data-permission-action="${permission}"]`)
      ?.addEventListener("click", () => {
        void handlePermissionAction(permission);
      });
  });

  await refreshOnboarding();
});
