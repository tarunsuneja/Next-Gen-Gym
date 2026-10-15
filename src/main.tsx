import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { InstallPrompt } from "./InstallPrompt";
import "./styles.css";
import "./theme.css";
import "./refinements.css";
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <InstallPrompt />
  </React.StrictMode>,
);
