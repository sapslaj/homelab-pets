import { remote } from "@pulumi/command";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import dedent from "dedent";
import * as YAML from "yaml";

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
      "sudo mkdir -p /var/ansible\n",
      pulumi.all({ remotePath }).apply(({ remotePath }) => `sudo chown -Rv $USER:$USER ${remotePath}\n`),
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

    const rolesCopies: remote.CopyToRemote[] = [];
    if (props.rolePaths) {
      for (const [index, rolePath] of props.rolePaths?.entries()) {
        const source = new pulumi.asset.FileArchive(rolePath);
        rolesCopies.push(
          new remote.CopyToRemote(`${id}-roles-copy-${index}`, {
            connection,
            source,
            remotePath,
          }, {
            parent: this,
            dependsOn: [
              init,
            ],
          }),
        );
      }
    }

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

          cd '${remotePath}'
          [[ -s requirements.yml ]] && with_backoff ansible-galaxy install -r requirements.yml
          with_backoff ansible-playbook -i localhost, '${id}.yml'
        `)
      ),
      connection,
      triggers: [
        new Date(),
        playbookYaml,
        init,
        initCommands,
        ...rolesCopies,
      ],
    }, {
      parent: this,
      dependsOn: [
        init,
        ...rolesCopies,
      ],
    });
  }
}
