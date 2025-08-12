import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { SystemdUnit } from "./SystemdUnit";

export interface RsyncBackupProps {
  connection?: mid.types.input.ConnectionArgs;
  triggers?: mid.types.input.TriggersInputArgs;
  retainRsyncPackageOnDelete?: boolean;
  backupJobs: {
    remote?: boolean;
    src: string;
    dest: string;
    defaultParameters?: string;
    additionalParameters?: string;
  }[];
  backupTimer?: {
    onActiveSec?: number;
    onBootSec?: number;
    onStartupSec?: number;
    onUnitActiveSec?: number;
    onCalendar?: string;
    randomizedDelaySec?: number;
    fixedRandomDelay?: boolean;
  };
}

export class RsyncBackup extends pulumi.ComponentResource {
  service: SystemdUnit;
  timer: SystemdUnit;

  constructor(name: string, props: RsyncBackupProps, opts: pulumi.ComponentResourceOptions = {}) {
    super("sapslaj:mid:RsyncBackup", name, {}, opts);

    const rsyncPackage = new mid.resource.Apt(`${name}-rsync`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "rsync",
    }, {
      parent: this,
      retainOnDelete: props.retainRsyncPackageOnDelete,
    });

    const execStart: string[] = [];

    for (const job of props.backupJobs) {
      let parameters = job.defaultParameters ?? "--archive --verbose --human-readable --update --partial --progress";
      if (job.additionalParameters !== undefined) {
        parameters += " " + job.additionalParameters;
      }
      if (job.remote === true || (!job.dest.includes("@") && !job.dest.includes(":"))) {
        execStart.push(`/usr/bin/mkdir -p "${job.dest}"`);
      }
      execStart.push(`/usr/bin/rsync ${parameters} "${job.src}" "${job.dest}"`);
    }

    this.service = new SystemdUnit(`${name}-service`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "rsync-backup.service",
      unit: {
        "Description": "rsync backup",
      },
      service: {
        "Type": "oneshot",
        "ExecStart": execStart,
      },
    }, {
      parent: this,
      dependsOn: [
        rsyncPackage,
      ],
    });

    const backupTimer = props.backupTimer ?? {
      onCalendar: "hourly",
      randomizedDelaySec: 1800,
      fixedRandomDelay: true,
    };

    const timerConfig: Record<string, pulumi.Input<string>> = {};
    if (backupTimer.onActiveSec !== undefined) {
      timerConfig["OnActiveSec"] = backupTimer.onActiveSec.toString();
    }
    if (backupTimer.onBootSec !== undefined) {
      timerConfig["OnBootSec"] = backupTimer.onBootSec.toString();
    }
    if (backupTimer.onStartupSec !== undefined) {
      timerConfig["OnStartupSec"] = backupTimer.onStartupSec.toString();
    }
    if (backupTimer.onUnitActiveSec !== undefined) {
      timerConfig["OnUnitActiveSec"] = backupTimer.onUnitActiveSec.toString();
    }
    if (backupTimer.onCalendar !== undefined) {
      timerConfig["OnCalendar"] = backupTimer.onCalendar;
    }
    if (backupTimer.randomizedDelaySec !== undefined) {
      timerConfig["RandomizedDelaySec"] = backupTimer.randomizedDelaySec.toString();
    }
    if (backupTimer.fixedRandomDelay !== undefined) {
      timerConfig["FixedRandomDelay"] = `${backupTimer.fixedRandomDelay}`;
    }

    this.timer = new SystemdUnit(`${name}-timer`, {
      connection: props.connection,
      triggers: props.triggers,
      name: "rsync-backup.timer",
      unit: {
        "Description": "rsync backup",
        "Wants": "network-online.target",
      },
      timer: timerConfig,
      install: {
        "WantedBy": "timers.target",
      },
    }, {
      parent: this,
      dependsOn: [
        this.service,
      ],
    });
  }
}
