import { queryOptions, useQuery } from "@tanstack/react-query";
import { type Favorite, listFavorites } from "../api";
import { queryKeys } from "./keys";

export const favoritesQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.favorites,
    queryFn: () => listFavorites().then((r) => r.favorites),
    staleTime: 60_000,
  });

export const useFavoritesQuery = () => useQuery(favoritesQueryOptions());

export type { Favorite };
