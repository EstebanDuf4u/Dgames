#!/usr/bin/env python3
"""
deploy.py — Déploiement du portail Dgames via Paramiko (SSH/SFTP).

Usage :
    python deploy.py

Le script :
  1. Transfère les fichiers du projet vers /opt/dgames-portal/ sur le VPS
  2. Lance docker compose up -d --build à distance
"""

import os
import sys
import paramiko

# Force UTF-8 sur la console Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# ── Config ────────────────────────────────────────
HOST     = "178.104.51.243"
PORT     = 22
USER     = "esteban"
PASSWORD = "esteban"
REMOTE   = "/home/esteban/dgames-portal"

# Fichiers/dossiers à transférer (relatifs à ce script)
UPLOADS = [
    "index.html",
    "admin.html",
    "profile.html",
    "nginx.conf",
    "docker-compose.yml",
    "Dockerfile",
    "css/style.css",
    "css/admin.css",
    "css/profile.css",
    "js/app.js",
    "js/admin.js",
    "js/profile.js",
    "api/main.py",
    "api/requirements.txt",
    "api/Dockerfile",
    "api/games.json",
]

# ── Helpers ───────────────────────────────────────
def sftp_upload(sftp: paramiko.SFTPClient, local: str, remote: str) -> None:
    remote_dir = os.path.dirname(remote)
    try:
        sftp.stat(remote_dir)
    except FileNotFoundError:
        # mkdir -p récursif
        parts = remote_dir.split("/")
        path = ""
        for part in parts:
            if not part:
                continue
            path = f"{path}/{part}"
            try:
                sftp.stat(path)
            except FileNotFoundError:
                sftp.mkdir(path)
    sftp.put(local, remote)
    print(f"  >> {local} -> {remote}")


def run(ssh: paramiko.SSHClient, cmd: str) -> None:
    print(f"\n$ {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd)
    for line in stdout:
        print(f"   {line}", end="")
    err = stderr.read().decode()
    if err:
        print(f"[stderr] {err}")
    rc = stdout.channel.recv_exit_status()
    if rc != 0:
        raise RuntimeError(f"Commande échouée (rc={rc}): {cmd}")


# ── Main ──────────────────────────────────────────
def main() -> None:
    base = os.path.dirname(os.path.abspath(__file__))

    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())

    print(f"Connexion à {USER}@{HOST}…")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD)

    run(ssh, f"mkdir -p {REMOTE}/css {REMOTE}/js {REMOTE}/api {REMOTE}/js")

    sftp = ssh.open_sftp()

    print("\nTransfert des fichiers…")
    for rel_path in UPLOADS:
        local  = os.path.join(base, *rel_path.split("/"))
        remote = f"{REMOTE}/{rel_path}"
        sftp_upload(sftp, local, remote)

    sftp.close()

    print("\nDéploiement Docker…")
    run(ssh, f"cd {REMOTE} && docker compose down --remove-orphans")
    run(ssh, f"cd {REMOTE} && docker compose up -d --build")
    # Copie le games.json initial dans le volume seulement s'il n'existe pas encore
    run(ssh, (
        "docker run --rm "
        "-v dgames-portal_dgames-api-data:/data "
        f"-v {REMOTE}/api:/src "
        "alpine sh -c 'test -f /data/games.json || cp /src/games.json /data/games.json'"
    ))

    print("\nStatut des conteneurs :")
    run(ssh, "docker ps --filter name=dgames-portal --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'")

    ssh.close()
    print("\nDéploiement terminé.")


if __name__ == "__main__":
    main()
