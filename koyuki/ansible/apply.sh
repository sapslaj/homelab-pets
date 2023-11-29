#!/bin/sh
ansible-playbook --vault-password-file=vault_password -i koyuki.sapslaj.xyz, main.yml "$@"
