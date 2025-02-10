import { remote } from "@pulumi/command";
import { remote as remote_inputs } from "@pulumi/command/types/input";
import * as pulumi from "@pulumi/pulumi";
import dedent from "dedent";
import * as YAML from "yaml";

export interface AnsibleProvisionerProps {
  connection: remote_inputs.ConnectionArgs;
  rolePaths?: string[];
  ansibleInstallCommand?: string;
  requirements?: any;
  playbook?: any;
  roles?: any;
}

export class AnsibleProvisioner extends pulumi.ComponentResource {
  constructor(id: string, props: AnsibleProvisionerProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:ansible:AnsibleProvisioner", id, {}, opts);

    const connection = props.connection;

    const playbook = props.playbook ?? [{
      hosts: "localhost",
      connection: "local",
      become: true,
      roles: props.roles ?? [],
    }];

    const initCommands: string[] = [
      "sudo mkdir -p /var/ansible",
      "sudo chown -Rv $USER:$USER /var/ansible",
    ];
    if (props.ansibleInstallCommand) {
      initCommands.push(props.ansibleInstallCommand);
    }
    if (props.requirements !== undefined) {
      initCommands.push(
        `printf '${btoa(YAML.stringify(props.requirements))}' | base64 -d | tee /var/ansible/requirements.yml`,
      );
    }
    initCommands.push(
      `printf '${btoa(YAML.stringify(playbook))}' | base64 -d | tee /var/ansible/main.yml`,
    );

    const init = new remote.Command(`${id}-init`, {
      create: initCommands.join("\n"),
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
            remotePath: "/var/ansible",
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
      create: dedent(`
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

        cd /var/ansible
        [[ -s requirements.yml ]] && with_backoff ansible-galaxy install -r requirements.yml
        with_backoff ansible-playbook -i localhost, main.yml
      `),
      connection,
      triggers: [
        new Date(),
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
