import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

let updaterStarted = false;

function formatUpdateMessage(version: string, notes?: string | null) {
  const normalizedNotes = notes?.trim();

  if (!normalizedNotes) {
    return `unsigned {char} ${version} is available. Install it now?`;
  }

  return `unsigned {char} ${version} is available.\n\n${normalizedNotes}\n\nInstall it now?`;
}

export async function startUpdater() {
  if (updaterStarted || import.meta.env.DEV || typeof window === "undefined") {
    return;
  }

  updaterStarted = true;

  try {
    const update = await check();

    if (!update) {
      return;
    }

    const shouldInstall = window.confirm(formatUpdateMessage(update.version, update.body));

    if (!shouldInstall) {
      return;
    }

    await update.downloadAndInstall();

    const shouldRestart = window.confirm(
      `unsigned {char} ${update.version} was installed. Restart now to finish the update?`,
    );

    if (shouldRestart) {
      await relaunch();
    }
  } catch (error) {
    console.warn("Updater check failed", error);
  }
}
