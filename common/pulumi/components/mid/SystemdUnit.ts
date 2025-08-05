import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { mergeTriggers } from "../../mid-utils";

export type SystemdSection = pulumi.Input<Record<string, pulumi.Input<string | string[]>>>;

export interface SystemdUnitProps extends mid.resource.SystemdServiceArgs {
  unit?: SystemdSection;
  install?: SystemdSection;
  service?: SystemdSection;
  timer?: SystemdSection;
}

export class SystemdUnit extends pulumi.ComponentResource {
  file: mid.resource.File;
  unit: mid.resource.SystemdService;

  constructor(name: string, props: SystemdUnitProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:SystemdUnit", name, {}, opts);

    const sections: pulumi.Output<string>[] = [];

    if (props.unit) {
      sections.push(this.renderSection("Unit", props.unit));
    }
    if (props.install) {
      sections.push(this.renderSection("Install", props.install));
    }
    if (props.service) {
      sections.push(this.renderSection("Service", props.service));
    }
    if (props.timer) {
      sections.push(this.renderSection("Timer", props.timer));
    }

    this.file = new mid.resource.File(name, {
      connection: props.connection,
      triggers: props.triggers,
      config: props.config,
      path: pulumi.interpolate`/etc/systemd/system/${props.name}`,
      content: pulumi.concat(...sections.flatMap((v, i) => i === 0 ? [v] : ["\n", v])),
    }, {
      parent: this,
    });

    this.unit = new mid.resource.SystemdService(name, {
      daemonReload: true,
      ...props,
      triggers: mergeTriggers(props.triggers, {
        refresh: [
          this.file.triggers.lastChanged,
        ],
      }),
    }, {
      parent: this,
    });
  }

  renderSection(name: string, section: SystemdSection): pulumi.Output<string> {
    return pulumi.output(section).apply((s) => {
      let result = `[${name}]\n`;
      for (const [key, value] of Object.entries(s)) {
        if (Array.isArray(value)) {
          for (const subvalue of value) {
            result += `${key}=${subvalue}\n`;
          }
        } else {
          result += `${key}=${value}\n`;
        }
      }
      return result;
    });
  }
}
