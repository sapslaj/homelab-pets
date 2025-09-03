import * as pulumi from "@pulumi/pulumi";
import * as infisical from "@sapslaj/pulumi-infisical";

import { PulumiInputWrapper } from "./ptypes";

export type Environment = "prod" | "dev";

export const defaultEnvironment: Environment = "prod";

export type ProjectName = "homelab" | "CI";

export const projectIds: Record<ProjectName, string> = {
  CI: "17fc82ff-de30-456b-8e48-8a487d2edc6f",
  homelab: "31d6c3cb-b90f-45d1-9ef2-1377d40596e3",
};

export const defaultProject: ProjectName = "homelab";

export const projectSlugs: Record<ProjectName, string> = {
  CI: "ci-cl-fz",
  homelab: "homelab-d-lif",
};

export interface GetSecretsArgs {
  env?: string;
  folder?: string;
  project?: string;
  projectId?: string;
}

export interface GetSecretValueArgs extends GetSecretsArgs {
  key: string;
}

export function getSecrets(
  args: GetSecretsArgs = {},
  opts?: pulumi.InvokeOptions,
): Promise<infisical.GetSecretsResult> {
  return infisical.getSecrets({
    envSlug: args.env ?? defaultEnvironment,
    folderPath: args.folder ?? "/",
    workspaceId: args.projectId ?? projectIds[args.project ?? defaultProject],
  }, opts);
}

export function getSecretValue(
  args: GetSecretValueArgs,
  opts?: pulumi.InvokeOptions,
): Promise<string> {
  return getSecrets(args, opts).then((res) => res.secrets[args.key].value);
}

export function getSecretsOutput(
  args: PulumiInputWrapper<GetSecretsArgs> = {},
  opts?: pulumi.InvokeOutputOptions,
): pulumi.Output<infisical.GetSecretsResult> {
  return infisical.getSecretsOutput({
    envSlug: pulumi.output(args.env).apply((v) => v ?? defaultEnvironment),
    folderPath: pulumi.output(args.folder).apply((v) => v ?? "/"),
    workspaceId: pulumi.all({ projectId: args.projectId, project: args.project }).apply(({ projectId, project }) =>
      projectId ?? projectIds[project ?? defaultProject]
    ),
  }, opts);
}

export function getSecretValueOutput(
  args: PulumiInputWrapper<GetSecretValueArgs>,
  opts?: pulumi.InvokeOutputOptions,
): pulumi.Output<string> {
  return pulumi.all({
    output: getSecretsOutput(args, opts),
    key: args.key,
  }).apply(
    (values) => {
      const output = values.output as pulumi.UnwrappedObject<infisical.GetSecretsResult>;
      const key = values.key as string;
      return output.secrets[key].value;
    },
  );
}
