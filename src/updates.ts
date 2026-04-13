import { listen } from "@tauri-apps/api/event";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

const CHECK_FOR_UPDATES_EVENT = "check-for-updates";

let updaterStarted = false;
let updateCheckInFlight = false;

function formatUpdateMessage(version: string, notes?: string | null) {
  const normalizedNotes = notes?.trim();

  if (!normalizedNotes) {
    return `unsigned Char ${version} is available. Install it now?`;
  }

  return `unsigned Char ${version} is available.\n\n${normalizedNotes}\n\nInstall it now?`;
}

async function runUpdateCheck(options: { userInitiated: boolean }) {
  if (import.meta.env.DEV || typeof window === "undefined") {
    if (options.userInitiated) {
      window.alert("Update checks are unavailable in development builds.");
    }

    return;
  }

  if (updateCheckInFlight) {
    if (options.userInitiated) {
      window.alert("An update check is already in progress.");
    }

    return;
  }

  updateCheckInFlight = true;

  try {
    const update = await check();

    if (!update) {
      if (options.userInitiated) {
        window.alert("unsigned Char is up to date.");
      }

      return;
    }

    const shouldInstall = window.confirm(formatUpdateMessage(update.version, update.body));

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRestart = window.confirm(
      `unsigned Char ${update.version} was installed. Restart now to finish the update?`,
    );

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    console.warn("Updater check failed", error);

    if (options.userInitiated) {
      window.alert("Unable to check for updates right now.");
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

  await listen(CHECK_FOR_UPDATES_EVENT, () => {
    void runUpdateCheck({ userInitiated: true });
  });

  void runUpdateCheck({ userInitiated: false });
}
