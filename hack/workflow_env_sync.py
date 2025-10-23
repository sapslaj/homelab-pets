#!/usr/bin/env -S uv run --script
#
# /// script
# requires-python = ">=3.12"
# dependencies = ["ruamel.yaml"]
# ///


import os
import pathlib

import ruamel.yaml


ENV = {
    "AUTHENTIK_INSECURE": "false",
    "AUTHENTIK_TOKEN": "${{ secrets.AUTHENTIK_TOKEN }}",
    "AUTHENTIK_URL": "https://login.sapslaj.cloud",
    "AWS_ACCESS_KEY_ID": "${{ secrets.AWS_ACCESS_KEY_ID }}",
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_REGION": "us-east-1",
    "AWS_SECRET_ACCESS_KEY": "${{ secrets.AWS_SECRET_ACCESS_KEY }}",
    "CLOUDFLARE_ACCOUNT_ID": "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    "CLOUDFLARE_API_KEY": "${{ secrets.CLOUDFLARE_API_KEY }}",
    "CLOUDFLARE_EMAIL": "${{ secrets.CLOUDFLARE_EMAIL }}",
    "GH_ACTIONS_READ_TOKEN": "${{ secrets.GH_ACTIONS_READ_TOKEN }}",
    "GITHUB_TOKEN": "${{ secrets.GH_ACTIONS_ADMIN_GITHUB_TOKEN }}",
    "INFISICAL_API_URL": "https://infisical.sapslaj.cloud/api",
    "INFISICAL_CLIENT_ID": "${{ secrets.INFISICAL_CLIENT_ID }}",
    "INFISICAL_CLIENT_SECRET": "${{ secrets.INFISICAL_CLIENT_SECRET }}",
    "INFISICAL_HOST": "https://infisical.sapslaj.cloud",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_ID": "${{ secrets.INFISICAL_CLIENT_ID }}",
    "INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET": "${{ secrets.INFISICAL_CLIENT_SECRET }}",
    "NODE_AUTH_TOKEN": "${{ secrets.GH_ACTIONS_READ_TOKEN }}",
    "PROXMOX_VE_ENDPOINT": "${{ secrets.PROXMOX_VE_ENDPOINT }}",
    "PROXMOX_VE_INSECURE": "true",
    "PROXMOX_VE_PASSWORD": "${{ secrets.PROXMOX_VE_PASSWORD }}",
    "PROXMOX_VE_USERNAME": "${{ secrets.PROXMOX_VE_USERNAME }}",
    "PULUMI_CONFIG_PASSPHRASE": "",
    "TAILSCALE_API_KEY": "${{ secrets.TAILSCALE_API_KEY }}",
    "VULTR_API_KEY": "${{ secrets.VULTR_API_KEY }}",
    "VYOS_HOST": "${{ secrets.VYOS_HOST }}",
    "VYOS_PASSWORD": "${{ secrets.VYOS_PASSWORD }}",
    "VYOS_USERNAME": "${{ secrets.VYOS_USERNAME }}",
}


def main():
    yaml = ruamel.yaml.YAML(typ="rt")
    workflows_dir = pathlib.Path(__file__).parent.parent / ".gitea" / "workflows"
    for filename in os.listdir(workflows_dir):
        print(f"syncing {filename}")
        with open(workflows_dir / filename, "r+") as fp:
            workflow = yaml.load(fp)
            fp.seek(0)
            fp.truncate(0)
            workflow["env"] = ENV
            yaml.dump(workflow, fp)


if __name__ == "__main__":
    main()
