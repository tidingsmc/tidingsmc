import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/rubik";
import "./index.css";
import App from "./App.tsx";
import { initLanguage } from "./lib/i18n";
import { listenForNotificationClicks } from "./lib/notifications";
import { initTheme } from "./lib/theme";

initTheme();
initLanguage();
listenForNotificationClicks();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
