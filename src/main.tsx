import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, HashRouter } from "react-router-dom";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/inter";
import "@fontsource/jetbrains-mono/400.css";
import "./styles/globals.css";
import "./styles/landing.css";
import App from "./app/App";
// Pages serves static files, so hosted routes live after # and refresh safely.
// Local development keeps the existing /explore/... addresses.
const Router =
  import.meta.env.VITE_GITHUB_PAGES === "true" ? HashRouter : BrowserRouter;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Router>
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </Router>
  </React.StrictMode>,
);
