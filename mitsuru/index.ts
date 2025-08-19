import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import * as mid from "@sapslaj/pulumi-mid";

import { Autoupdate } from "../common/pulumi/components/mid/Autoupdate";
import { BaselineUsers } from "../common/pulumi/components/mid/BaselineUsers";
import { MidTarget } from "../common/pulumi/components/mid/MidTarget";
import { PrometheusNodeExporter } from "../common/pulumi/components/mid/PrometheusNodeExporter";
import { Vector } from "../common/pulumi/components/mid/Vector";

const connection: mid.types.input.ConnectionArgs = {
  host: "mitsuru.sapslaj.xyz",
  port: 22,
  user: os.userInfo().username,
  // TODO: fix SSH agent in CI
  privateKey: fs.readFileSync(path.join(os.userInfo().homedir, ".ssh", "id_rsa"), { encoding: "utf8" }),
};

const midTarget = new MidTarget("mitsuru", {
  connection,
});

new BaselineUsers("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new PrometheusNodeExporter("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new Vector("mitsuru", {
  connection,
}, {
  dependsOn: [
    midTarget,
  ],
});

new Autoupdate("mitsuru", {
  connection,
  autoreboot: false,
}, {
  dependsOn: [
    midTarget,
  ],
});
