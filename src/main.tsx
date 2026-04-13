import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { AppRouter } from "./router";
import { appStore } from "./store";
import { startUpdater } from "./updates";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing app root");
}

void appStore.start();
void startUpdater();

createRoot(root).render(
  <StrictMode>
    <AppRouter />
  </StrictMode>,
);
