// GSD Setup - Application Entry Point
// Copyright (c) 2026 Jeremy McSpadden <jeremy@fluxlabs.net>

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { bootstrapTheme } from "./lib/theme";

// Apply the stored theme before React mounts so light-theme users don't
// see a dark flash on first paint.
bootstrapTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
