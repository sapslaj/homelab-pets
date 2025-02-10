import * as path from "path";
import { VyosLeasesHostLookup } from "../common/pulumi/components/proxmox-vm/host-lookup";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";
import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";

(async () => {
  const hostLookup = new VyosLeasesHostLookup({
    sshConfig: {
      host: process.env.VYOS_HOST,
      username: process.env.VYOS_USERNAME,
      password: process.env.VYOS_PASSWORD,
    },
  });

  new ProxmoxVM("soju", {
    name: "soju",
    traits: [
      new BaseConfigTrait("base", {
        ansible: {
          hostLookup,
          rolePaths: [
            path.join(__dirname, "./ansible/roles"),
          ],
          roles: [
            {
              role: "sapslaj.soju",
            },
          ],
        },
      }),
    ],
  });
})();
