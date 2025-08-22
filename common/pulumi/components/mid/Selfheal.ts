import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";
import * as YAML from "yaml";

export interface SelfhealProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  tasks?: Record<string, pulumi.Input<string>>;
}

export class Selfheal extends pulumi.ComponentResource {
  timer: mid.resource.SystemdService;
  service: mid.resource.SystemdService;

  constructor(name: string, props: SelfhealProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:Selfheal", name, {}, opts);

    const ansiblePackage = new mid.resource.Apt(`${name}-ansible`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "ansible",
      config: {
        check: false,
      },
    }, {
      parent: this,
    });

    const selfHealDir = new mid.resource.File(`${name}-/etc/selfheal`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/selfheal",
      ensure: "directory",
    }, {
      parent: this,
    });

    const tasksDir = new mid.resource.File(`${name}-/etc/selfheal/tasks`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/selfheal/tasks",
      ensure: "directory",
    }, {
      parent: this,
      dependsOn: [
        selfHealDir,
      ],
    });

    const entryPointPlaybook = new mid.resource.File(`${name}-/etc/selfhealh/selfheal.yml`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/selfheal/selfheal.yml",
      content: YAML.stringify([
        {
          hosts: "127.0.0.1",
          connection: "local",
          tasks: [
            {
              include: "{{ task_item }}",
              with_fileglob: "tasks/*.yml",
              loop_control: {
                loop_var: "task_item",
              },
            },
          ],
        },
      ]),
    }, {
      parent: this,
      dependsOn: [
        selfHealDir,
      ],
    });

    const taskFiles: mid.resource.File[] = [];
    for (const [key, value] of Object.entries(props.tasks ?? {})) {
      taskFiles.push(
        new mid.resource.File(`${name}-/etc/selfheal/${key}.yml`, {
          connection: props.connection,
          triggers: props.triggers,
          path: `/etc/selfheal/tasks/${key}.yml`,
          content: value,
        }, {
          parent: this,
          dependsOn: [
            tasksDir,
          ],
        }),
      );
    }

    const systemdServiceFile = new mid.resource.File(`${name}-/etc/systemd/system/selfhealh.service`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/systemd/system/selfhealh.service",
      content: [
        "[Unit]",
        "Description=Self-heal services",
        "After=network-online.target",
        "",
        "[Service]",
        "Type=oneshot",
        `Environment="ANSIBLE_STDOUT_CALLBACK=actionable"`,
        "ExecStart=/usr/bin/ansible-playbook -i localhost, selfheal.yml",
        "WorkingDirectory=/etc/selfheal",
        "",
      ].join("\n"),
    }, {
      parent: this,
    });

    const systemdTimerFile = new mid.resource.File(`${name}-/etc/systemd/system/selfhealh.timer`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/systemd/system/selfhealh.timer",
      content: [
        "[Unit]",
        "Description=Self-heal services",
        "After=network-online.target",
        "",
        "[Timer]",
        "OnBootSec=5m",
        "OnUnitActiveSec=10m",
        "",
        "[Install]",
        "WantedBy=timers.target",
        "",
      ].join("\n"),
    }, {
      parent: this,
    });

    this.service = new mid.resource.SystemdService(`${name}-selfheal.service`, {
      connection: props.connection,
      name: "selfheal.service",
      daemonReload: true,
      triggers: {
        refresh: [
          entryPointPlaybook,
          systemdServiceFile,
          ...taskFiles,
          ...(props.triggers?.refresh ?? []) as any,
        ],
        ...props.triggers,
      },
    }, {
      parent: this,
      dependsOn: [
        ansiblePackage,
      ],
    });

    this.timer = new mid.resource.SystemdService(`${name}-selfheal.timer`, {
      connection: props.connection,
      name: "selfheal.timer",
      daemonReload: true,
      triggers: {
        refresh: [
          systemdTimerFile,
          ...(props.triggers?.refresh ?? []) as any,
        ],
        ...props.triggers,
      },
    }, {
      parent: this,
      dependsOn: [
        this.service,
      ],
    });
  }
}
