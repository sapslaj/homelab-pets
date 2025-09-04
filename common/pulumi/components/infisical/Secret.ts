import * as pulumi from "@pulumi/pulumi";
import * as infisical from "@sapslaj/pulumi-infisical";

import { defaultEnvironment, defaultProject, Environment, projectIds, ProjectName } from ".";

export interface SecretProps {
  env?: pulumi.Input<Environment>;
  parent?: pulumi.Input<string>;
  name?: pulumi.Input<string>;
  projectId?: pulumi.Input<string>;
  project?: pulumi.Input<ProjectName>;
  secretReminder?: pulumi.Input<infisical.types.input.SecretSecretReminder>;
  tagIds?: pulumi.Input<pulumi.Input<string>[]>;
  value: pulumi.Input<string>;
}

export class Secret extends infisical.Secret {
  projectId: pulumi.Output<string>;
  env: pulumi.Output<Environment>;
  parent: pulumi.Output<string>;
  path: pulumi.Output<string>;

  constructor(name: string, props: SecretProps, opts: pulumi.CustomResourceOptions = {}) {
    const env = props.env ?? defaultEnvironment;
    const parent = pulumi.output(props.parent).apply((parent) => {
      if (parent === undefined || parent === "/") {
        return "/";
      }
      if (parent.endsWith("/")) {
        return parent.replace(/\/$/, "");
      }
      return parent;
    });
    const projectId = props.projectId ?? pulumi.output(props.project).apply((project) => {
      if (project === undefined) {
        return projectIds[defaultProject];
      }
      return projectIds[project];
    });

    let args: infisical.SecretArgs = {
      workspaceId: projectId,
      folderPath: parent,
      envSlug: env,
      name: props.name,
      value: props.value,
      secretReminder: props.secretReminder,
      tagIds: props.tagIds,
    };

    super(name, args, opts);

    this.projectId = pulumi.output(projectId);
    this.env = pulumi.output(env);
    this.parent = parent;
    this.path = pulumi.all({
      parent: this.parent,
      name: this.name,
    }).apply(({
      parent,
      name,
    }) => {
      if (!parent.endsWith("/")) {
        parent += "/";
      }
      return parent + name;
    });
  }
}
