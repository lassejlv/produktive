import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "./schema.graphql",
  documents: ["src/**/*.graphql"],
  ignoreNoDocuments: true,
  generates: {
    "./src/gql/": {
      preset: "client",
      config: {
        scalars: {
          JSON: "unknown",
        },
      },
    },
  },
  hooks: {
    afterAllFileWrite: [
      "bunx oxfmt src/gql/graphql.ts src/gql/gql.ts src/gql/index.ts src/gql/fragment-masking.ts",
    ],
  },
};

export default config;
