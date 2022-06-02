from invoke import task

@task
def apply(c):
    c.run("ansible-playbook -i zerotwo.sapslaj.xyz, main.yml")
