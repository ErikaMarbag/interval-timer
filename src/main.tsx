import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { TimerPage } from "./App";
import { registerServiceWorker } from "./lib/pwa";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TimerPage />
  </StrictMode>,
);
registerServiceWorker();
