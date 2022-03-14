from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i zerotwo.homelab.sapslaj.com, main.yml")
