import { print } from "graphql";
import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import { apiPath } from "@/lib/api";

type GraphQLWireResponse<TData> = {
  data?: TData;
  errors?: Array<{ message: string }>;
};

export async function graphqlRequest<TData, TVariables>(
  document: TypedDocumentNode<TData, TVariables>,
  variables?: TVariables,
): Promise<TData> {
  const response = await fetch(apiPath("/api/graphql"), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: print(document),
      variables: variables ?? {},
    }),
  });

  const payload = (await response.json().catch(() => null)) as GraphQLWireResponse<TData> | null;
  if (!response.ok || payload?.errors?.length) {
    throw new Error(payload?.errors?.[0]?.message ?? "GraphQL request failed");
  }
  if (!payload?.data) {
    throw new Error("GraphQL response did not include data");
  }

  return payload.data;
}

export function unwrapGraphQLJson<T>(value: unknown): T {
  return value as T;
}
