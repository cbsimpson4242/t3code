import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserHistory, createHashHistory } from "@tanstack/react-router";

import "@xterm/xterm/css/xterm.css";
import "../../web/src/index.css";

import { getRouter } from "./router";
import { APP_DISPLAY_NAME } from "./branding";
import { isElectron } from "@legacy/env";

const history = isElectron ? createHashHistory() : createBrowserHistory();
const router = getRouter(history);

document.title = APP_DISPLAY_NAME;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
