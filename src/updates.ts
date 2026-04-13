import { confirm, message } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_FOR_UPDATES_EVENT = "check-for-updates";
const MAIN_WINDOW_LABEL = "main";

let updaterStarted = false;
let updateCheckInFlight = false;

function formatUpdateMessage(version: string, notes?: string | null) {
  const normalizedNotes = notes?.trim();

  if (!normalizedNotes) {
    return `unsigned Char ${version} is available. Install it now?`;
  }

  return `unsigned Char ${version} is available.\n\n${normalizedNotes}\n\nInstall it now?`;
}

function formatUpdateError(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  return "Unknown updater error.";
}

async function runUpdateCheck(options: { userInitiated: boolean }) {
  if (import.meta.env.DEV || typeof window === "undefined") {
    if (options.userInitiated) {
      await message("Update checks are unavailable in development builds.", {
        kind: "info",
        title: "Updates Unavailable",
      });
    }

    return;
  }

  if (updateCheckInFlight) {
    if (options.userInitiated) {
      await message("An update check is already in progress.", {
        kind: "info",
        title: "Checking for Updates",
      });
    }

    return;
  }

  updateCheckInFlight = true;

  try {
    const update = await check();

    if (!update) {
      if (options.userInitiated) {
        await message("You're running the latest version of unsigned Char.", {
          kind: "info",
          title: "No Updates Available",
        });
      }

      return;
    }

    const shouldInstall = await confirm(formatUpdateMessage(update.version, update.body), {
      kind: "info",
      title: "Update Available",
      okLabel: "Install",
      cancelLabel: "Later",
    });

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRestart = await confirm(
      `unsigned Char ${update.version} was installed. Restart now to finish the update?`,
      {
        kind: "info",
        title: "Update Installed",
        okLabel: "Restart",
        cancelLabel: "Later",
      },
    );

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    console.warn("Updater check failed", error);

    if (options.userInitiated) {
      await message(`Unable to check for updates right now.\n\n${formatUpdateError(error)}`, {
        kind: "error",
        title: "Update Error",
      });
    }
  } finally {
    updateCheckInFlight = false;
  }
}

export async function startUpdater() {
  if (updaterStarted || typeof window === "undefined") {
    return;
  }

  updaterStarted = true;
  const currentWindow = getCurrentWindow();

  await listen(CHECK_FOR_UPDATES_EVENT, () => {
    void runUpdateCheck({ userInitiated: true });
  });

  if (currentWindow.label === MAIN_WINDOW_LABEL) {
    void runUpdateCheck({ userInitiated: false });
  }
}
