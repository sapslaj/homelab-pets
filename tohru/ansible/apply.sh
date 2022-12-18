#!/bin/sh
ansible-playbook --vault-password-file=vault_password -i tohru.sapslaj.xyz, main.yml "$@"
