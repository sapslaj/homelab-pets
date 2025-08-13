import * as tls from "@pulumi/tls";

import { ProxmoxVM, ProxmoxVMProps } from "./ProxmoxVM";
import { ProxmoxVMTrait } from "./ProxmoxVMTrait";

export interface PrivateKeyTraitConfig {
  privateKey?: tls.PrivateKey;
  privateKeyConfig?: Partial<tls.PrivateKeyArgs>;
  addPrivateKeyToUserdata?: boolean;
}

export class PrivateKeyTrait implements ProxmoxVMTrait {
  static traitStore = {
    privateKey: Symbol("privateKey"),
  };

  static privateKeyFor(vm: ProxmoxVM): tls.PrivateKey | undefined {
    return vm._traitStore[PrivateKeyTrait.traitStore.privateKey] as tls.PrivateKey | undefined;
  }

  constructor(public name: string, public config: PrivateKeyTraitConfig = {}) {}

  forProps(props: ProxmoxVMProps, name: string, parent: ProxmoxVM): ProxmoxVMProps {
    let newProps = { ...props };

    if (!newProps.connectionArgs?.privateKey && !newProps.connectionArgs?.password) {
      let privateKey: tls.PrivateKey;
      if (this.config.privateKey) {
        privateKey = this.config.privateKey;
      } else {
        privateKey = new tls.PrivateKey(`${name}-${this.name}`, {
          algorithm: "ED25519",
          ecdsaCurve: "P256",
          ...this.config.privateKeyConfig,
        }, { parent });
      }

      parent._traitStore[PrivateKeyTrait.traitStore.privateKey] = privateKey;

      if (this.config.addPrivateKeyToUserdata !== false) {
        if (newProps.userData === undefined) {
          newProps.userData = {};
        }
        if (newProps.userData.ssh_authorized_keys === undefined) {
          newProps.userData.ssh_authorized_keys = [];
        }

        newProps.userData.ssh_authorized_keys.push(privateKey.publicKeyOpenssh.apply((s) => s.trim()));
      }

      if (newProps.connectionArgs === undefined) {
        newProps.connectionArgs = {};
      }
      newProps.connectionArgs.privateKey = privateKey.privateKeyOpenssh;
    }

    return newProps;
  }
}
