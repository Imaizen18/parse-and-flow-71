import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { getRouter } from "./router";

// Create the router instance using your existing configuration
const router = getRouter();

// Register the router instance for strict type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Mount the React application to the root div
const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>
  );
}