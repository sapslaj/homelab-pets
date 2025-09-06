import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { getSecretValueOutput } from "../common/pulumi/components/infisical";
import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";
import { DNSRecord } from "../common/pulumi/components/shimiko";

new DNSRecord("A", {
  name: "ganyu",
  records: ["172.24.4.5"],
  type: "A",
});

const midProvider = new mid.Provider("ganyu", {
  connection: {
    host: "172.24.4.5",
    port: 22,
    user: "root",
    privateKey: getSecretValueOutput({
      folder: "/ci",
      key: "SSH_PRIVATE_KEY",
    }),
  },
});

const midTarget = new MidTarget("ganyu", {}, {
  provider: midProvider,
});

new BaselineUsers("ganyu", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("ganyu", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("ganyu", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("ganyu", {}, {
  provider: midProvider,
  dependsOn: [
    midTarget,
  ],
});
