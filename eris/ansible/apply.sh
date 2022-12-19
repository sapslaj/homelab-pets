#!/bin/sh
ansible-playbook --vault-password-file=vault_password -i eris.sapslaj.xyz, main.yml "$@"
