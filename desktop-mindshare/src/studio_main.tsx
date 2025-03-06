console.log("✅ studio_main.tsx is starting...");

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./studio_app.tsx"; // Ensure this file exists
import "./index.css";

console.log("studio_main mounted")

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
