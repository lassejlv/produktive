# Public GraphQL API

The public API is available at `POST /api/v1/graphql` and requires an API key:

```sh
curl https://produktive.app/api/v1/graphql \
  -H "Authorization: Bearer pk_live_..." \
  -H "Content-Type: application/json" \
  -d '{"query":"query { viewer { workspace { id name slug } } }"}'
```

API keys are pinned to one workspace. Every query and mutation is scoped to that workspace.

## Queries

```graphql
query {
  viewer {
    user { id name email image }
    workspace { id name slug image }
  }

  issues(limit: 50, filter: { status: "backlog" }) {
    id
    title
    status
    priority
    project { id name color icon }
    labels { id name color }
  }

  labels(includeArchived: false) {
    id
    name
    color
    issueCount
  }

  projects(includeArchived: false) {
    id
    name
    status
    issueCount
    doneCount
    statusBreakdown { backlog todo inProgress done }
  }
}
```

Single-resource queries return `null` when the ID is not in the API key workspace:

```graphql
query {
  issue(id: "issue-id") { id title }
  label(id: "label-id") { id name }
  project(id: "project-id") { id name }
}
```

## Mutations

```graphql
mutation {
  createIssue(input: {
    title: "Triage webhook retries"
    description: "Check failing retry jobs"
    priority: "high"
    labelIds: ["label-id"]
  }) {
    issue { id title status priority }
  }
}
```

Available mutations:

- `createIssue(input)`, `updateIssue(id, input)`, `deleteIssue(id)`
- `createLabel(input)`, `updateLabel(id, input)`, `deleteLabel(id)`
- `createProject(input)`, `updateProject(id, input)`, `deleteProject(id)`

Delete mutations return `{ ok: true }` when successful.

## Errors

Authentication, validation, and permission failures are returned as GraphQL errors. Missing IDs in mutation inputs return errors; missing IDs in single-resource queries return `null`.
