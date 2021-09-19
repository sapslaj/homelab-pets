from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i eris.homelab.sapslaj.com, --vault-password-file=vault_password main.yml")
