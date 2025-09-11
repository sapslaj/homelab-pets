import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { NASClient } from "../common/pulumi/components/mid/NASClient";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const midProvider = new mid.Provider("eris", {
  connection: {
    host: "eris.sapslaj.xyz",
    port: 22,
    user: "ci",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("eris", {}, {
  provider: midProvider,
});

new BaselineUsers("eris-baseline-users", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("eris-node-exporter", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("eris-vector", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("eris-autoupdate", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new NASClient("eris-nas-client", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});
