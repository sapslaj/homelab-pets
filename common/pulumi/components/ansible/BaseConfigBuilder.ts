import * as path from "path";

import * as pulumi from "@pulumi/pulumi";

import { AnsiblePlaybookRole, AnsibleProvisionerProps } from "./AnsibleProvisioner";

export interface BaseRsyncBackupJobConfig {
  src: string;
  dest: string;
  defaultParameters?: string;
  additionalParameters?: string;
}

export interface BaseRsyncBackupTimerConfig {
  onActiveSec?: number;
  onBootSec?: number;
  onStartupSec?: number;
  onUnitActiveSec?: number;
  onCalender?: string;
  randomizedDelaySec?: number;
  fixedRandomDelay?: boolean;
}

export interface BaseRsyncBackupConfig {
  timer?: BaseRsyncBackupTimerConfig;
  jobs?: BaseRsyncBackupJobConfig[];
}

export interface BasePromtailConfig {
  scrapeConfigs?: {
    journal?: boolean;
    syslog?: boolean;
    docker?: boolean;
  };
  extraScrapeConfigs?: Record<string, any>[];
  vars?: Record<string, any>;
}

export interface BaseDockerStandaloneConfig {
  rsyncBackupJob?: Partial<BaseRsyncBackupJobConfig>;

  /**
   * @default true
   */
  enableSelfheal?: boolean;

  /**
   * @default true
   */
  enableDockerHousekeeper?: boolean;

  /**
   * @default true
   */
  enableCadvisor?: boolean;

  cadvisorArgs?: string[];

  /**
   * @default "gcr.io/cadvisor/cadvisor:v0.47.0"
   */
  cadvisorImage?: string;

  /**
   * @default false
   */
  installFromOfficialRepo?: boolean;

  /**
   * @default true
   */
  enableWatchtower?: boolean;

  watchTowerHttpApiToken?: string;

  watchPowerPort?: number;
}

export interface BaseConfig {
  /**
   * @default true
   */
  ansibleTarget?: boolean;

  /**
   * @default true
   */
  unfuckUbuntu?: boolean;

  /**
   * @default true
   */
  users?: boolean;

  /**
   * @default true
   */
  nodeExporter?: boolean;

  /**
   * @default false
   */
  qemuGuest?: boolean;

  /**
   * @default false
   */
  processExporter?: boolean;

  /**
   * @default false
   */
  nasClient?: boolean;

  /**
   * @default false
   */
  dockerStandalone?: boolean | BaseDockerStandaloneConfig;

  /**
   * @default false
   */
  selfheal?: boolean;

  /**
   * @default false
   */
  rsyncBackup?: boolean | BaseRsyncBackupConfig;

  /**
   * @default true
   */
  promtail?: boolean | BasePromtailConfig;
}

export class BaseConfigBuilder {
  static journalPromtailScrapeConfig = {
    job_name: "journal",
    journal: {
      json: false,
      max_age: "12h",
      path: "/var/log/journal",
      labels: {
        job: "systemd-journal",
      },
    },
    relabel_configs: [
      {
        source_labels: ["__journal__systemd_unit"],
        target_label: "systemd_unit",
      },
      {
        source_labels: ["__journal__hostname"],
        target_label: "systemd_hostname",
      },
      {
        source_labels: ["__journal_syslog_identifier"],
        target_label: "systemd_syslog_identifier",
      },
    ],
  };

  static dockerPromtailScrapeConfig = {
    job_name: "docker",
    docker_sd_configs: [
      {
        host: "unix:///var/run/docker.sock",
      },
    ],
    relabel_configs: [
      {
        source_labels: ["__meta_docker_container_id"],
        target_label: "container_id",
      },
      {
        source_labels: ["__meta_docker_container_name"],
        target_label: "container",
      },
    ],
  };

  static syslogPromtailScrapeConfig = {
    job_name: "syslog",
    syslog: {
      listen_address: "127.0.0.1:5144",
      idle_timeout: "60s",
      label_structured_data: true,
      labels: {
        job: "syslog",
      },
    },
    relabel_configs: [
      {
        source_labels: ["__syslog_message_severity"],
        target_label: "syslog_severity",
      },
      {
        source_labels: ["__syslog_message_facility"],
        target_label: "syslog_facility",
      },
      {
        source_labels: ["__syslog_message_hostname"],
        target_label: "syslog_hostname",
      },
      {
        source_labels: ["__syslog_message_app_name"],
        target_label: "syslog_app_name",
      },
    ],
  };

  enableAnsibleTargetRole: boolean;
  enableUnfuckUbuntuRole: boolean;
  enableNodeExporterRole: boolean;
  enableUsersRole: boolean;
  enableQemuGuestRole: boolean;
  enableProcessExporterRole: boolean;
  enableNasClientRole: boolean;
  enableDockerStandaloneRole: boolean;
  enableSelfHealRole: boolean;
  enableRsyncBackupRole: boolean;
  enablePromtailRole: boolean;
  enableRsyslogPromtailRole: boolean;

  dockerStandaloneConfig: BaseDockerStandaloneConfig;
  rsyncBackupConfig: BaseRsyncBackupConfig;
  promtailConfig: BasePromtailConfig;
  promtailScrapeConfigs: Record<string, any>[] = [];

  constructor(public baseConfig: BaseConfig) {
    this.enableAnsibleTargetRole = baseConfig.ansibleTarget ?? true;
    this.enableUnfuckUbuntuRole = baseConfig.unfuckUbuntu ?? true;
    this.enableUsersRole = baseConfig.users ?? true;
    this.enableNodeExporterRole = baseConfig.nodeExporter ?? true;
    this.enableQemuGuestRole = baseConfig.qemuGuest ?? false;
    this.enableProcessExporterRole = baseConfig.processExporter ?? false;
    this.enableNasClientRole = baseConfig.nasClient ?? false;
    this.enableSelfHealRole = baseConfig.selfheal ?? false;
    this.enablePromtailRole = typeof baseConfig.promtail === "boolean" ? baseConfig.promtail : true;
    this.enableRsyncBackupRole = typeof baseConfig.rsyncBackup === "boolean"
      ? baseConfig.rsyncBackup
      : false;
    this.enableDockerStandaloneRole = baseConfig.dockerStandalone === undefined
      ? false
      : Boolean(baseConfig.dockerStandalone);

    this.dockerStandaloneConfig = typeof baseConfig.dockerStandalone === "boolean"
      ? {}
      : baseConfig.dockerStandalone ?? {};
    this.rsyncBackupConfig = typeof baseConfig.rsyncBackup === "boolean"
      ? {}
      : baseConfig.rsyncBackup ?? {};
    this.promtailConfig = typeof baseConfig.promtail === "boolean" ? {} : baseConfig.promtail ?? {};
    this.enableRsyslogPromtailRole = this.enablePromtailRole && this.promtailConfig.scrapeConfigs?.syslog !== false;

    if (!this.rsyncBackupConfig.timer) {
      this.rsyncBackupConfig.timer = {
        onCalender: "hourly",
        randomizedDelaySec: 1800,
        fixedRandomDelay: true,
      };
    }

    if (!this.rsyncBackupConfig.jobs) {
      this.rsyncBackupConfig.jobs = [];
    }

    this.setPromtailLokiServerUrl("http://loki.sapslaj.xyz");
  }

  setRsyncBackupTimer(timer: BaseRsyncBackupTimerConfig) {
    this.rsyncBackupConfig.timer = timer;
  }

  addRsyncBackupJob(job: BaseRsyncBackupJobConfig) {
    if (!this.rsyncBackupConfig.jobs) {
      this.rsyncBackupConfig.jobs = [];
    }
    this.rsyncBackupConfig.jobs.push(job);
  }

  addPromtailScrapeConfig(scrapeConfig: Record<string, any>) {
    this.promtailScrapeConfigs.push(scrapeConfig);
  }

  setPromtailLokiServerUrl(url: string) {
    if (!this.promtailConfig.vars) {
      this.promtailConfig.vars = {};
    }
    this.promtailConfig.vars.promtail_loki_server_url = url;
  }

  build(): Pick<AnsibleProvisionerProps, "rolePaths" | "roles"> {
    return {
      rolePaths: this.buildRolePaths(),
      roles: this.buildRoles(),
    };
  }

  buildRolePaths(): string[] {
    return [
      path.join(__dirname, "../../../ansible/roles"),
    ];
  }

  buildRoles(): AnsiblePlaybookRole[] {
    const roles: AnsiblePlaybookRole[] = [];

    if (this.enableAnsibleTargetRole) {
      roles.push({
        role: "sapslaj.ansible_target",
      });
    }

    if (this.enableUnfuckUbuntuRole) {
      roles.push({
        role: "sapslaj.unfuck_ubuntu",
      });
    }

    if (this.enableUsersRole) {
      roles.push({
        role: "sapslaj.users",
      });
    }

    if (this.enableNodeExporterRole) {
      roles.push({
        role: "prometheus.prometheus.node_exporter",
      });
    }

    if (this.enableQemuGuestRole) {
      roles.push({
        role: "sapslaj.qemu_guest",
      });
    }

    if (this.enableProcessExporterRole) {
      roles.push({
        role: "cloudalchemy.process_exporter",
        vars: {
          process_exporter_version: "0.7.10",
        },
      });
    }

    if (this.enableNasClientRole) {
      roles.push({
        role: "sapslaj.nas_client",
      });
    }

    if (this.enableSelfHealRole) {
      roles.push({
        role: "sapslaj.selfheal",
      });
    }

    if (this.enableDockerStandaloneRole) {
      roles.push({
        role: "sapslaj.docker_standalone",
        vars: this.buildDockerStandaloneVars(),
      });
    }

    if (this.enableRsyslogPromtailRole) {
      roles.push({
        role: "sapslaj.rsyslog_promtail",
      });
    }

    if (this.enablePromtailRole) {
      roles.push({
        role: "patrickjahns.promtail",
        vars: this.buildPromtailVars(),
      });
    }

    if (this.enableRsyncBackupRole) {
      roles.push({
        role: "sapslaj.rsync_backup",
        vars: this.buildRsyncBackupVars(),
      });
    }

    return roles;
  }

  buildDockerStandaloneVars(): Record<string, any> {
    return {
      enable_cadvisor: this.dockerStandaloneConfig.enableCadvisor,
      enable_watchtower: this.dockerStandaloneConfig.enableWatchtower,
      enable_docker_housekeeper: this.dockerStandaloneConfig.enableDockerHousekeeper,
      enable_selfheal: this.dockerStandaloneConfig.enableSelfheal,
      cadvisor_args: this.dockerStandaloneConfig.cadvisorArgs,
      cadvisor_image: this.dockerStandaloneConfig.cadvisorImage,
      docker_install_from_official_repo: this.dockerStandaloneConfig.installFromOfficialRepo,
      watchtower_http_api_token: this.dockerStandaloneConfig.watchTowerHttpApiToken,
      watchtower_port: this.dockerStandaloneConfig.watchPowerPort,
    };
  }

  buildPromtailVars(): Record<string, any> {
    return {
      promtail_extra_parameters: "--client.external-labels=hostname=%H",
      promtail_config_scrape_configs: [
        ...this.promtailScrapeConfigs,
        ...(this.promtailConfig.extraScrapeConfigs ?? []),
      ],
      ...this.promtailConfig.vars,
    };
  }

  buildRsyncBackupVars(): Record<string, any> {
    return {
      rsync_backup_timer: {
        on_active_sec: this.rsyncBackupConfig.timer?.onActiveSec,
        on_boot_sec: this.rsyncBackupConfig.timer?.onBootSec,
        on_startup_sec: this.rsyncBackupConfig.timer?.onStartupSec,
        on_unit_active_sec: this.rsyncBackupConfig.timer?.onUnitActiveSec,
        on_calendar: this.rsyncBackupConfig.timer?.onCalender,
        randomized_delay_sec: this.rsyncBackupConfig.timer?.randomizedDelaySec,
        fixed_random_delay: this.rsyncBackupConfig.timer?.fixedRandomDelay,
      },
      rsync_backup_jobs: (this.rsyncBackupConfig.jobs ?? []).map((j) => ({
        src: j.src,
        dest: j.dest,
        additional_parameters: j.additionalParameters,
        default_parameters: j.defaultParameters,
      })),
    };
  }
}
