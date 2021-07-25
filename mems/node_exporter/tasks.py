from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i mems.homelab.sapslaj.com, main.yml")
