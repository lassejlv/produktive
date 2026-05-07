import type { InfiniteData } from "@tanstack/react-query";
import type { Issue, IssuesPage } from "@/lib/api";

export type IssuesCache = InfiniteData<IssuesPage> | undefined;
type Cache = IssuesCache;

export const flattenIssues = (data: Cache): Issue[] =>
  data?.pages.flatMap((page) => page.issues) ?? [];

const mapPages = (data: Cache, fn: (issues: Issue[]) => Issue[]): Cache =>
  data
    ? { ...data, pages: data.pages.map((page) => ({ ...page, issues: fn(page.issues) })) }
    : data;

export const prependIssue = (data: Cache, issue: Issue): Cache => {
  if (!data) return data;
  const [first, ...rest] = data.pages;
  if (!first) {
    return {
      ...data,
      pages: [{ issues: [issue], nextCursor: null, hasMore: false }],
      pageParams: [null],
    };
  }
  return {
    ...data,
    pages: [{ ...first, issues: [issue, ...first.issues] }, ...rest],
  };
};

export const patchIssue = (
  data: Cache,
  id: string,
  patch: Partial<Issue>,
): Cache =>
  mapPages(data, (issues) =>
    issues.map((issue) =>
      issue.id === id ? ({ ...issue, ...patch } as Issue) : issue,
    ),
  );

export const replaceIssue = (data: Cache, issue: Issue): Cache =>
  mapPages(data, (issues) => issues.map((i) => (i.id === issue.id ? issue : i)));

export const removeIssue = (data: Cache, id: string): Cache =>
  mapPages(data, (issues) => issues.filter((issue) => issue.id !== id));

export const upsertIssue = (data: Cache, issue: Issue): Cache => {
  if (!data) return data;
  const existsInPage = data.pages.findIndex((p) =>
    p.issues.some((i) => i.id === issue.id),
  );
  if (existsInPage >= 0) {
    return mapPages(data, (issues) =>
      issues.map((i) => (i.id === issue.id ? issue : i)),
    );
  }
  return prependIssue(data, issue);
};
