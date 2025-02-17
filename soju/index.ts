import * as path from "path";

import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

new ProxmoxVM("soju", {
  name: "soju",
  traits: [
    new BaseConfigTrait("base", {
      ansible: {
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
