#!/bin/sh
ansible-playbook -i inventory main.yml "$@"
