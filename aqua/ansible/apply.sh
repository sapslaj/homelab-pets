#!/bin/sh
ansible-playbook --vault-password-file=vault_password -i aqua.sapslaj.xyz, main.yml "$@"
