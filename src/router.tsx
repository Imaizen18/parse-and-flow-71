import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Start preloading faster when hovering links
    defaultPreloadDelay: 50,
    defaultPreload: "intent",
    // Keep data fresh longer to avoid refetching lag during transitions
    defaultPreloadStaleTime: 1000 * 60 * 5, 
    // Make transitions feel instant by rendering fallback quickly
    defaultPendingMinMs: 0,
    defaultPendingComponent: () => null,
  });

  return router;
};
