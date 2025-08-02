import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

export interface UserDefinition {
  enabled?: boolean;
  name?: pulumi.Input<string>;
  password?: pulumi.Input<string>;
  sshKey?: pulumi.Input<string>;
}

export const defaultUsers: Record<string, UserDefinition> = {
  sapslaj: {
    enabled: true,
    name: "sapslaj",
    password: "$6$HKmDQSk/$prBGGB/SR0Kw5VTyquE3gfiHhYcy7xOr2yUpVIPdfZy./DC2BYljx0KYhqTX.d5ELFcf7mrQk2KeP0nuIaXCz1",
    sshKey:
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDALIs2j0FT1nlmRdIoaGt+gzyn8iOgHDQS1lg5ivSYDpU3tKsLQgFB9l+q0zB0hODNaVSiJfekMi43gkULnUf20g5M0ysAgjowDKIeGsFQIKWifO9J7aXSEdAaupIcPDZt8oWqJysxqpxL5pICbQzU1+f7yk2L8bC5rd1mQGgoDWvRkwUCtAdL5pGndDpZ7xke2eYvTwglDEjr32F0zQf1u2t7XNGWPJhIbvvipEsRZY68W0HAgNKo3qWA/Q2jdbFvgNWXeEvvHKT+13exjhZrXFUaA3XCkZx0WZanCn5MMShENhVgn01HGGrKOLCm5jk49lJIesYHRkYfx5PzZT6B saps.laj@gmail.com",
  },
  ci: {
    enabled: true,
    name: "ci",
    password: "*",
    sshKey:
      "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCmJsCb5da9gTwpettT9ba8cGQwlnKDUNZuwr64KnaLufzCkRaiSBFgsLC3UvFCrmnONZFnwXYruaQXRukKxThOvfRvCPz/ieiD/udzvgXRR/BHyhWUcLSs3IthNF7ic5EAqStL1Fo6Y6oEot43MvD/5W0IonF70J6bjjgxq5kajaubW7EKNUdhbzmycNc0orkEHO4NQSr7OWOULuXd9asVi/W4xG2kOqKEkZ9i5HtHcYsdHW8sbYVVQy/JlXm0I+UdpCQ6XrlasW/QuUrdT/qPKYC4b8a1jvyY1z8I8TMFahQq0UMCdm+QubMWKJCwkc0GskvezfwRO0GCmaNYKFus04qDzk6d5fAji1P8xJsmbm2I0GDD0snxNQ/+1cY+4Dc9g86Hh50HjeR6rCX+fvH5LG/m9G1uT7VbBxRQCpl0QfcKMn0U6w5FcGZIb/SfdXU8erKalAoPow3kCBZ8bwGc7SdWaBEpxpz4SorcDWn5wso+o/AH8dlY42fv7D81yrk= ci@sapslaj.com",
  },
};

export interface BaselineUsersProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  useBash?: boolean;
  users?: Record<string, UserDefinition>;
}

export class BaselineUsers extends pulumi.ComponentResource {
  constructor(name: string, props: BaselineUsersProps = {}, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:BaselineUsers", name, {}, opts);
    delete opts.providers;

    let userDefs: Record<string, UserDefinition> = {};
    for (const [key, def] of Object.entries(defaultUsers)) {
      userDefs[key] = { ...def };
    }
    if (props.users) {
      for (const [key, def] of Object.entries(props.users)) {
        userDefs[key] = {
          ...userDefs[key],
          ...def,
        };
      }
    }

    new mid.resource.FileLine(`${name}-passwordless-sudo`, {
      connection: props.connection,
      triggers: props.triggers,
      path: "/etc/sudoers",
      line: "%admin ALL=(ALL) NOPASSWD:ALL",
      regexp: "^%admin ALL=(ALL)",
    }, {
      ...opts,
      parent: this,
      retainOnDelete: true,
    });

    const adminGroup = new mid.resource.Group(`${name}-admin`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "admin",
    }, {
      ...opts,
      parent: this,
    });

    for (const [key, def] of Object.entries(userDefs)) {
      if (def.enabled === false) {
        continue;
      }
      const userArgs: mid.resource.UserArgs = {
        connection: props.connection,
        triggers: props.triggers,
        name: def.name ?? key,
        groupsExclusive: false,
        groups: [
          adminGroup.name,
        ],
      };
      if (props.useBash !== false) {
        userArgs.shell = "/bin/bash";
      }
      if (def.password !== undefined) {
        userArgs.password = def.password;
      }
      const user = new mid.resource.User(`${name}-${key}`, userArgs, {
        ...opts,
        parent: this,
      });

      if (def.sshKey !== undefined) {
        // TODO: mid: ssh authorized key resource
        const sshDir = new mid.resource.File(
          `${name}-${key}/.ssh`,
          {
            connection: props.connection,
            triggers: props.triggers,
            path: pulumi.interpolate`/home/${user.name}/.ssh`,
            ensure: "directory",
            owner: user.name,
            group: user.name,
            mode: "700",
          },
          pulumi.mergeOptions(opts, {
            parent: this,
            dependsOn: [
              user,
            ],
            retainOnDelete: true,
            deletedWith: user,
          }),
        );

        const authorizedKeysFile = new mid.resource.File(
          `${name}-${key}/.ssh/authorized_keys`,
          {
            connection: props.connection,
            triggers: props.triggers,
            path: pulumi.interpolate`/home/${user.name}/.ssh/authorized_keys`,
            ensure: "file",
            owner: user.name,
            group: user.name,
            mode: "400",
          },
          pulumi.mergeOptions(opts, {
            parent: this,
            dependsOn: [
              sshDir,
            ],
            retainOnDelete: true,
            deletedWith: user,
          }),
        );

        new mid.resource.FileLine(
          `${name}-${key}-ssh-key`,
          {
            connection: props.connection,
            triggers: props.triggers,
            path: pulumi.interpolate`/home/${user.name}/.ssh/authorized_keys`,
            line: def.sshKey,
          },
          pulumi.mergeOptions(opts, {
            parent: this,
            dependsOn: [
              authorizedKeysFile,
            ],
            retainOnDelete: true,
            deletedWith: user,
          }),
        );
      }
    }
  }
}
