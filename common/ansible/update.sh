#!/bin/sh
ansible-playbook -i inventory update.yml "$@"
