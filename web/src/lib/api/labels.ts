import {
  CreateLabelDocument,
  DeleteLabelDocument,
  LabelDocument,
  LabelsDocument,
  UpdateLabelDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/graphql/client";

export type LabelSummary = {
  id: string;
  name: string;
  color: string;
};

export type Label = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
};

export type CreateLabelInput = {
  name: string;
  description?: string;
  color?: string;
};

export type UpdateLabelInput = Partial<CreateLabelInput> & {
  archived?: boolean;
};

export const listLabels = (includeArchived = false) =>
  graphqlRequest(LabelsDocument, { includeArchived }).then((data) =>
    unwrapGraphQLJson<{ labels: Label[] }>(data.labels),
  );

export const getLabel = (id: string) =>
  graphqlRequest(LabelDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.label),
  );

export const createLabel = (input: CreateLabelInput) =>
  graphqlRequest(CreateLabelDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.createLabel),
  );

export const updateLabel = (id: string, patch: UpdateLabelInput) =>
  graphqlRequest(UpdateLabelDocument, { id, input: patch }).then((data) =>
    unwrapGraphQLJson<{ label: Label }>(data.updateLabel),
  );

export const deleteLabel = (id: string) =>
  graphqlRequest(DeleteLabelDocument, { id }).then(() => undefined as void);
