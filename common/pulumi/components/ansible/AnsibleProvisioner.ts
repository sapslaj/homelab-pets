import { remote } from "@pulumi/command";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import dedent from "dedent";
import * as YAML from "yaml";

import { directoryHash, stringHash } from "../../asset-utils";

export interface AnsiblePlaybookRole {
  role: pulumi.Input<string>;
  vars?: pulumi.Input<Record<string, pulumi.Input<any>>>;
  [key: string]: pulumi.Input<any>;
}

export interface AnsibleProvisionerProps {
  connection: remote_inputs.ConnectionArgs;
  rolePaths?: string[];
  ansibleInstallCommand?: pulumi.Input<string>;
  requirements?: pulumi.Input<any>;
  roles?: pulumi.Input<AnsiblePlaybookRole>[];
  postTasks?: pulumi.Input<pulumi.Input<any>[]>;
  preTasks?: pulumi.Input<pulumi.Input<any>[]>;
  tasks?: pulumi.Input<pulumi.Input<any>[]>;
  vars?: pulumi.Input<Record<string, pulumi.Input<any>>>;
  remotePath?: pulumi.Input<string>;
  triggers?: pulumi.Input<any[]>;
}

interface RolesCopy {
  rolePath: string;
  asset: pulumi.asset.FileArchive;
  resource: remote.CopyToRemote;
  resourceId: string;
  hash: pulumi.Output<string>;
}

export class AnsibleProvisioner extends pulumi.ComponentResource {
  constructor(id: string, props: AnsibleProvisionerProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:ansible:AnsibleProvisioner", id, {}, opts);

    const remotePath = props.remotePath ?? "/var/ansible";

    const connection = props.connection;

    const playbook = pulumi.all({
      roles: props.roles,
      preTasks: props.preTasks,
      postTasks: props.postTasks,
      tasks: props.tasks,
      vars: props.vars,
    }).apply(({
      roles,
      preTasks,
      postTasks,
      tasks,
      vars,
    }) => [{
      hosts: "localhost",
      connection: "local",
      become: true,
      roles: roles ?? [],
      pre_tasks: preTasks,
      post_tasks: postTasks,
      tasks: tasks,
      vars: vars,
    }]);

    const initCommands: pulumi.Input<string>[] = [
      pulumi.all({ remotePath }).apply(({ remotePath }) =>
        [
          `sudo mkdir -p ${remotePath}\n`,
          `sudo chown -Rv $USER:$USER ${remotePath}\n`,
        ].join("")
      ),
    ];
    if (props.ansibleInstallCommand) {
      initCommands.push(props.ansibleInstallCommand);
    }
    if (props.requirements !== undefined) {
      const requirementsYaml = pulumi.output(props.requirements).apply((requirements) => YAML.stringify(requirements));

      initCommands.push(
        pulumi.all({ requirementsYaml, remotePath }).apply(({ requirementsYaml, remotePath }) => {
          if (requirementsYaml.includes("EOF")) {
            return `printf ${btoa(requirementsYaml)} | base64 -d | tee ${remotePath}/requirements.yml\n`;
          } else {
            return [
              `cat << "EOF" | tee ${remotePath}/requirements.yml`,
              requirementsYaml,
              "EOF\n",
            ].join("\n");
          }
        }),
      );
    }

    const playbookYaml = playbook.apply((playbook) => YAML.stringify(playbook));
    initCommands.push(
      pulumi.all({ playbookYaml, remotePath }).apply(({ playbookYaml, remotePath }) => {
        if (playbookYaml.includes("EOF")) {
          return `printf '${btoa(playbookYaml)}' | base64 -d | tee ${remotePath}/${id}.yml\n`;
        } else {
          return [
            `cat << "EOF" | tee ${remotePath}/${id}.yml`,
            playbookYaml,
            "EOF\n",
          ].join("\n");
        }
      }),
    );

    const init = new remote.Command(`${id}-init`, {
      create: pulumi.concat(...initCommands),
      connection,
    }, {
      parent: this,
    });

    const rolesCopies = this.buildRolesCopies({
      connection,
      remotePath,
      id,
      rolesPaths: props.rolePaths,
      init,
    });

    const triggers = this.buildTriggers({
      remotePath,
      init,
      inputTriggers: props.triggers,
      playbook,
      rolesCopies,
      requirements: props.requirements,
    });

    const run = new remote.Command(`${id}-run`, {
      create: pulumi.all({ remotePath }).apply(({ remotePath }) =>
        dedent(`
          set -eu

          function with_backoff {
            local max_attempts=10
            local timeout=10
            local attempt=0
            local exit_code=0

            set +e
            while [ "$attempt" -lt "$max_attempts" ]; do
              "$@"
              exit_code="$?"

              if [ "$exit_code" = 0 ]; then
                set -e
                break
              fi

              echo "Failure running ($*) [$exit_code]; retrying in $timeout." 1>&2
              sleep "$timeout"
              attempt="$((attempt + 1))"
              timeout="$((timeout * 2))"
            done

            if [ "$exit_code" != 0 ]; then
              echo "Failure running ($*) [$exit_code]; No more retries left." 1>&2
            fi

            set -e
            return "$exit_code"
          }

          cd ${remotePath}
          [[ -s requirements.yml ]] && with_backoff ansible-galaxy install -r requirements.yml
          with_backoff ansible-playbook -i localhost, '${id}.yml'
        `)
      ),
      connection,
      triggers,
    }, {
      parent: this,
      dependsOn: [
        init,
        ...rolesCopies.map((rc) => rc.resource),
      ],
    });
  }

  protected buildRolesCopies(inputs: {
    id: string;
    rolesPaths?: string[];
    connection: remote_inputs.ConnectionArgs;
    remotePath: pulumi.Input<string>;
    init: remote.Command;
  }): RolesCopy[] {
    if (!inputs.rolesPaths) {
      return [];
    }

    const rolesCopies: RolesCopy[] = [];
    for (const [index, rolePath] of inputs.rolesPaths.entries()) {
      const resourceId = `${inputs.id}-roles-copy-${index}`;
      const hash = pulumi.output(directoryHash(rolePath));
      const asset = new pulumi.asset.FileArchive(rolePath);
      const resource = new remote.CopyToRemote(resourceId, {
        remotePath: inputs.remotePath,
        connection: inputs.connection,
        source: asset,
        triggers: [
          hash,
        ],
      }, {
        parent: this,
        dependsOn: [
          inputs.init,
        ],
      });
      rolesCopies.push({
        resourceId,
        resource,
        asset,
        rolePath,
        hash,
      });
    }
    return rolesCopies;
  }

  protected buildTriggers(inputs: {
    remotePath: pulumi.Input<string>;
    inputTriggers?: pulumi.Input<any[]>;
    requirements?: pulumi.Input<any>;
    playbook: pulumi.Output<any>;
    init: remote.Command;
    rolesCopies: RolesCopy[];
  }): pulumi.Output<any[]> {
    // change this to force reprovision on next up
    const serial = "serial:6e884a67-eec3-4ecc-bbc2-15f1122edf0f";

    const triggerParts: pulumi.Output<any[]>[] = [];

    if (inputs.inputTriggers) {
      triggerParts.push(pulumi.output(inputs.inputTriggers));
    }

    triggerParts.push(pulumi.output(inputs.remotePath).apply((remotePath) => [`remote-path:${remotePath}`]));

    if (inputs.requirements) {
      triggerParts.push(
        pulumi.output(inputs.requirements).apply((requirements) => [requirements]),
      );
    }

    triggerParts.push(
      pulumi.unsecret(
        pulumi.all({
          playbook: inputs.playbook,
          isSecret: pulumi.isSecret(inputs.playbook),
        }).apply(({
          playbook,
          isSecret,
        }) => {
          if (isSecret) {
            return [`playbook-secret:${stringHash(JSON.stringify(playbook))}`];
          } else {
            return [playbook];
          }
        }),
      ),
    );

    triggerParts.push(
      pulumi.unsecret(
        pulumi.all([
          inputs.init.id,
          inputs.init.create,
          pulumi.isSecret(inputs.init.create),
        ]).apply(([
          id,
          create,
          isSecret,
        ]) => {
          if (isSecret) {
            return [
              `init-id:${id}`,
              `init-cmd-secret:${stringHash(create ?? "")}`,
            ];
          } else {
            return [
              `init-id:${id}`,
              create,
            ];
          }
        }),
      ),
    );

    inputs.rolesCopies.forEach((rc) => {
      triggerParts.push(rc.hash.apply((hash) => [`${rc.resourceId}:${hash}`]));
    });

    return pulumi.all(triggerParts).apply((parts) => {
      const triggers: any[] = [];
      triggers.push(serial);
      if (process.env.ANSIBLE_PROVISIONER_FORCE) {
        triggers.push(new Date().toUTCString());
      }
      parts.forEach((part) => {
        triggers.push(...part);
      });
      return triggers;
    });
  }
}
