#!/usr/bin/env python3
import argparse
import os
import textwrap


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--name", required=True)
    args = parser.parse_args()

    os.mkdir(args.name)
    with open(f"{args.name}/Pulumi.yaml", "w") as f:
        f.write(
            textwrap.dedent(
                f"""
                name: homelab-pets-{args.name}
                runtime:
                  name: nodejs
                  options:
                    packagemanager: npm
                """,
            ).lstrip()
        )

    with open(f"{args.name}/index.ts", "w") as f:
        f.write(
            textwrap.dedent(
                """
                    import * as aws from "@pulumi/aws";
                    import * as pulumi from "@pulumi/pulumi";
                    import * as mid from "@sapslaj/pulumi-mid";

                    import { BaseConfigTrait } from "../common/pulumi/components/proxmox-vm/BaseConfigTrait";
                    import { ProxmoxVM } from "../common/pulumi/components/proxmox-vm/ProxmoxVM";

                    const vm = new ProxmoxVM("%s", {
                      traits: [
                        new BaseConfigTrait("base", {
                          mid: true,
                        }),
                      ],
                    });
                """
                % (args.name),
            ).lstrip()
        )


if __name__ == "__main__":
    main()
