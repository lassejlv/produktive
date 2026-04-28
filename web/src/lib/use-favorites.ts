import { useCallback, useEffect, useMemo, useState } from "react";
import {
  type Favorite,
  type FavoriteTarget,
  addFavorite as addFavoriteApi,
  listFavorites,
  removeFavorite as removeFavoriteApi,
} from "@/lib/api";

export function useFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await listFavorites();
      setFavorites(response.favorites);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Failed to load favorites",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const targets = useMemo(() => {
    const set = new Set<string>();
    for (const fav of favorites) set.add(`${fav.type}:${fav.id}`);
    return set;
  }, [favorites]);

  const isFavorite = useCallback(
    (type: FavoriteTarget, id: string) => targets.has(`${type}:${id}`),
    [targets],
  );

  const addFavorite = useCallback(
    async (type: FavoriteTarget, id: string) => {
      // Optimistic placeholder so the sidebar updates immediately.
      const placeholder: Favorite =
        type === "chat"
          ? {
              type: "chat",
              id,
              favoriteId: `pending:${id}`,
              title: "…",
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
      setFavorites((current) => [...current, placeholder]);
      try {
        await addFavoriteApi(type, id);
        await refresh();
      } catch (addError) {
        setFavorites((current) =>
          current.filter((fav) => fav.favoriteId !== placeholder.favoriteId),
        );
        throw addError;
      }
    },
    [favorites.length, refresh],
  );

  const removeFavorite = useCallback(
    async (type: FavoriteTarget, id: string) => {
      const previous = favorites;
      setFavorites((current) =>
        current.filter((fav) => !(fav.type === type && fav.id === id)),
      );
      try {
        await removeFavoriteApi(type, id);
      } catch (removeError) {
        setFavorites(previous);
        throw removeError;
      }
    },
    [favorites],
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
    isLoading,
    error,
    refresh,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  };
}
