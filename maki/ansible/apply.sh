#!/bin/sh
ansible-playbook --vault-password-file=vault_password -i maki.sapslaj.xyz, main.yml "$@"
