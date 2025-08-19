import * as os from "os";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const provider = new mid.Provider("mitsuru", {
  connection: {
    host: "mitsuru.sapslaj.xyz",
    port: 22,
    user: os.userInfo().username,
    sshAgent: true,
  },
  deleteUnreachable: true,
});

const midTarget = new MidTarget("mitsuru", {}, { provider });

new BaselineUsers("mitsuru", {}, {
  provider,
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("mitsuru", {}, {
  provider,
  dependsOn: [
    midTarget,
  ],
});

new Vector("mitsuru", {}, {
  provider,
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("mitsuru", {
  autoreboot: false,
}, {
  provider,
  dependsOn: [
    midTarget,
  ],
});
