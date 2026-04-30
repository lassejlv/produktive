import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import {
  type Favorite,
  type FavoriteTarget,
  addFavorite as addFavoriteApi,
  listFavorites,
  removeFavorite as removeFavoriteApi,
} from "@/lib/api";
import { queryKeys } from "@/lib/queries/keys";

export function useFavorites() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: queryKeys.favorites,
    queryFn: () => listFavorites().then((r) => r.favorites),
    staleTime: 60_000,
  });
  const favorites = query.data ?? [];

  const refresh = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: queryKeys.favorites });
  }, [qc]);

  const isFavorite = useCallback(
    (type: FavoriteTarget, id: string) =>
      favorites.some((fav) => fav.type === type && fav.id === id),
    [favorites],
  );

  const addFavorite = useCallback(
    async (type: FavoriteTarget, id: string) => {
      const placeholder: Favorite =
        type === "chat"
          ? {
              type: "chat",
              id,
              favoriteId: `pending:${id}`,
              title: "…",
              position: favorites.length,
            }
          : type === "project"
            ? {
                type: "project",
                id,
                favoriteId: `pending:${id}`,
                title: "…",
                color: "#888",
                icon: null,
                status: "active",
                position: favorites.length,
              }
            : {
                type: "issue",
                id,
                favoriteId: `pending:${id}`,
                title: "…",
                status: "backlog",
                priority: "medium",
                position: favorites.length,
              };

      qc.setQueryData<Favorite[]>(queryKeys.favorites, (old) =>
        old ? [...old, placeholder] : [placeholder],
      );

      try {
        await addFavoriteApi(type, id);
        await qc.invalidateQueries({ queryKey: queryKeys.favorites });
      } catch (error) {
        qc.setQueryData<Favorite[]>(queryKeys.favorites, (old) =>
          old?.filter((f) => f.favoriteId !== placeholder.favoriteId),
        );
        throw error;
      }
    },
    [favorites.length, qc],
  );

  const removeFavorite = useCallback(
    async (type: FavoriteTarget, id: string) => {
      const previous = qc.getQueryData<Favorite[]>(queryKeys.favorites);
      qc.setQueryData<Favorite[]>(queryKeys.favorites, (old) =>
        old?.filter((f) => !(f.type === type && f.id === id)),
      );
      try {
        await removeFavoriteApi(type, id);
      } catch (error) {
        if (previous) qc.setQueryData(queryKeys.favorites, previous);
        throw error;
      }
    },
    [qc],
  );

  const toggleFavorite = useCallback(
    async (type: FavoriteTarget, id: string) => {
      if (isFavorite(type, id)) {
        await removeFavorite(type, id);
      } else {
        await addFavorite(type, id);
      }
    },
    [addFavorite, isFavorite, removeFavorite],
  );

  return {
    favorites,
    isLoading: query.isPending,
    error: query.error?.message ?? null,
    refresh,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
