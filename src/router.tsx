import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Hors ligne : on affiche les données gardées en local au lieu d'une erreur
      queries: { networkMode: "offlineFirst", gcTime: 24 * 3_600_000 },
      mutations: { networkMode: "offlineFirst" },
    },
  });

  if (typeof window !== "undefined") {
    void import("./lib/offline/persist").then(({ restoreQueries, persistQueries }) => {
      void restoreQueries(queryClient);
      persistQueries(queryClient);
    });
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
