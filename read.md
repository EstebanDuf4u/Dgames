# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dgames est un portail statique (HTML/CSS/JS + Nginx) qui centralise l'accès aux jeux web sur le VPS `178.104.51.243`. L'authentification est déléguée à `dgames-auth` via cookie SSO partagé.

## Infrastructure

| Service        | Container         | Port VPS |
|----------------|-------------------|----------|
| Portail (this) | dgames-portal     | 8085     |
| Auth           | dgames-auth       | 8001     |
| Snake          | snake-front-1     | 8090     |
| Wordle         | wordle-frontend-1 | 8888     |

Réseau Docker externe : `dgames` (doit exister avant le démarrage).

## Deploy

```bash
# Déploiement complet vers le VPS (SSH/SFTP via Paramiko)
python deploy.py
```

`deploy.py` transfère les fichiers dans `/opt/dgames-portal/` puis exécute `docker compose up -d --build` à distance.

Dépendance locale : `pip install paramiko`

## Architecture

Aucun backend propre — Nginx sert les fichiers statiques et proxifie uniquement les appels auth.

```
Browser
  ├─ GET  /                → Nginx → static files
  ├─ POST /api/auth/login  → dgames-auth:8001/login
  ├─ GET  /api/auth/me     → dgames-auth:8001/me
  └─ POST /api/auth/logout → dgames-auth:8001/logout
```

## Auth — cookie SSO

- `dgames-auth` émet un cookie `dgames_token` (`HttpOnly; Domain=.noryx.fr; SameSite=Lax; Secure`)
- `js/app.js` utilise `credentials: 'include'` sur tous les `fetch`
- **Pas de token dans les URLs** — le cookie est envoyé automatiquement par le navigateur aux jeux
- Au chargement : `GET /api/auth/me` → si 200, afficher le portail ; sinon, afficher le formulaire

## Auth — endpoints (dgames-auth)

| Méthode | Chemin    | Body JSON                           | Réponse                       |
|---------|-----------|-------------------------------------|-------------------------------|
| POST    | /login    | `{"username": "…", "password": "…"}` | `{"token": "…", "username": "…"}` + Set-Cookie |
| POST    | /register | idem                                | idem                          |
| GET     | /me       | —                                   | `{"username": "…"}`           |
| POST    | /logout   | —                                   | efface le cookie              |

## Ajouter un jeu

1. Ajouter une `<a class="card game-card">` dans `index.html`
2. Ajouter son URL dans `UPLOADS` de `deploy.py` si des assets sont ajoutés
3. Pas de changement JS nécessaire — le cookie SSO gère l'auth automatiquement
