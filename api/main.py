"""dgames-api — portail Dgames."""
import json, os, time
from datetime import datetime, timezone
from typing import Union

import asyncpg, bcrypt, httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ── Config ─────────────────────────────────────────
GAMES_FILE      = "/data/games.json"
ACTIVITY_FILE   = "/data/activity.json"
META_FILE       = "/data/users_meta.json"
AUTH_URL        = "http://dgames-auth:8001"
ADMINS          = os.getenv("ADMINS", "esteban").split(",")
AUTH_DB         = dict(
    host=os.getenv("AUTH_DB_HOST", "auth-db"),
    user=os.getenv("AUTH_DB_USER", "auth"),
    password=os.getenv("AUTH_DB_PASS", "authpass"),
    database=os.getenv("AUTH_DB_NAME", "dgames_auth"),
)

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

# ── Models ──────────────────────────────────────────
class Game(BaseModel):
    id:          str
    name:        str
    icon:        str
    description: str
    url:         str
    visible:     bool = True
    maintenance: bool = False
    allowed:     Union[str, list] = "all"

class PlayEvent(BaseModel):
    game_id: str

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

# ── Persistence ─────────────────────────────────────
def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path) as f:
        return json.load(f)

def save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def load_games():  return load_json(GAMES_FILE,    [])
def save_games(g): save_json(GAMES_FILE, g)
def load_meta():   return load_json(META_FILE,     {"banned": [], "last_seen": {}})
def save_meta(m):  save_json(META_FILE, m)
def now_iso():     return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def append_activity(entry):
    log = load_json(ACTIVITY_FILE, [])
    log.insert(0, entry)
    save_json(ACTIVITY_FILE, log[:1000])

# ── Status cache ────────────────────────────────────
_status: dict  = {}
_status_ts     = 0.0

async def refresh_status():
    global _status, _status_ts
    result = {}
    async with httpx.AsyncClient(timeout=4, follow_redirects=True) as client:
        for g in load_games():
            try:
                t0 = time.time()
                r  = await client.get(g["url"])
                result[g["id"]] = {"up": r.status_code < 500, "ms": int((time.time()-t0)*1000)}
            except Exception:
                result[g["id"]] = {"up": False, "ms": None}
    _status, _status_ts = result, time.time()

# ── Auth helpers ────────────────────────────────────
async def current_user(request: Request) -> str | None:
    hdrs = {}
    if tok := request.cookies.get("dgames_token"):
        hdrs["Cookie"] = f"dgames_token={tok}"
    if auth := request.headers.get("Authorization"):
        hdrs["Authorization"] = auth
    try:
        async with httpx.AsyncClient() as c:
            r = await c.get(f"{AUTH_URL}/me", headers=hdrs)
            if r.status_code == 200:
                return r.json().get("username")
    except Exception:
        pass
    return None

async def require_admin(request: Request) -> str:
    user = await current_user(request)
    if not user or user not in ADMINS:
        raise HTTPException(403, "Accès admin requis")
    return user

async def db():
    return await asyncpg.connect(**AUTH_DB)

# ── Routes publiques ────────────────────────────────

@app.get("/")
async def get_games(request: Request):
    user = await current_user(request)
    meta = load_meta()
    if user and user in meta.get("banned", []):
        return []
    if user:
        meta.setdefault("last_seen", {})[user] = now_iso()
        save_meta(meta)
    return [
        g for g in load_games()
        if g.get("visible")
        and (g.get("allowed", "all") == "all" or (user and user in g.get("allowed", [])))
    ]

@app.get("/status")
async def get_status():
    if time.time() - _status_ts > 30:
        await refresh_status()
    return _status

@app.post("/activity/play")
async def log_play(event: PlayEvent, request: Request):
    user = await current_user(request)
    if not user:
        raise HTTPException(401, "Non authentifié")
    append_activity({"type": "play", "username": user, "game_id": event.game_id, "ts": now_iso()})
    return {"ok": True}

# ── Routes admin — jeux ─────────────────────────────

@app.get("/me")
async def me(user: str = Depends(require_admin)):
    return {"username": user, "admin": True}

@app.get("/all")
async def get_all(user: str = Depends(require_admin)):
    return load_games()

@app.post("/", status_code=201)
async def create_game(game: Game, user: str = Depends(require_admin)):
    games = load_games()
    if any(g["id"] == game.id for g in games):
        raise HTTPException(400, "ID déjà utilisé")
    games.append(game.model_dump())
    save_games(games)
    return game

@app.put("/order")
async def update_order(ids: list[str], user: str = Depends(require_admin)):
    games  = {g["id"]: g for g in load_games()}
    save_games([games[i] for i in ids if i in games] +
               [g for g in load_games() if g["id"] not in ids])
    return {"ok": True}

@app.put("/{game_id}")
async def update_game(game_id: str, game: Game, user: str = Depends(require_admin)):
    games = load_games()
    for i, g in enumerate(games):
        if g["id"] == game_id:
            games[i] = game.model_dump()
            save_games(games)
            return game
    raise HTTPException(404, "Jeu introuvable")

@app.delete("/{game_id}")
async def delete_game(game_id: str, user: str = Depends(require_admin)):
    games = load_games()
    new   = [g for g in games if g["id"] != game_id]
    if len(new) == len(games):
        raise HTTPException(404, "Jeu introuvable")
    save_games(new)
    return {"ok": True}

# ── Routes admin — utilisateurs ─────────────────────

@app.get("/users")
async def list_users(user: str = Depends(require_admin)):
    conn = await db()
    rows = await conn.fetch("SELECT username FROM users ORDER BY username")
    await conn.close()
    return [r["username"] for r in rows]

@app.get("/users/details")
async def users_details(user: str = Depends(require_admin)):
    meta      = load_meta()
    banned    = set(meta.get("banned", []))
    last_seen = meta.get("last_seen", {})
    conn      = await db()
    try:
        rows = await conn.fetch(
            "SELECT id, username, created_at FROM users ORDER BY id DESC"
        )
        return [{"username": r["username"],
                 "created_at": r["created_at"].isoformat() if r["created_at"] else None,
                 "last_seen":  last_seen.get(r["username"]),
                 "banned":     r["username"] in banned} for r in rows]
    except Exception:
        rows = await conn.fetch("SELECT id, username FROM users ORDER BY id DESC")
        return [{"username": r["username"], "created_at": None,
                 "last_seen": last_seen.get(r["username"]),
                 "banned":    r["username"] in banned} for r in rows]
    finally:
        await conn.close()

@app.post("/users/{username}/ban")
async def ban_user(username: str, admin: str = Depends(require_admin)):
    if username in ADMINS:
        raise HTTPException(403, "Impossible de bannir un admin")
    meta = load_meta()
    if username not in meta.get("banned", []):
        meta.setdefault("banned", []).append(username)
    save_meta(meta)
    return {"ok": True}

@app.post("/users/{username}/unban")
async def unban_user(username: str, admin: str = Depends(require_admin)):
    meta = load_meta()
    meta["banned"] = [u for u in meta.get("banned", []) if u != username]
    save_meta(meta)
    return {"ok": True}

@app.post("/users/me/password")
async def change_password(data: PasswordChange, request: Request):
    user = await current_user(request)
    if not user:
        raise HTTPException(401, "Non authentifié")
    if len(data.new_password) < 6:
        raise HTTPException(400, "Mot de passe trop court (6 min)")
    conn = await db()
    try:
        row = await conn.fetchrow("SELECT password_hash FROM users WHERE username=$1", user)
        if not row:
            raise HTTPException(404, "Utilisateur introuvable")
        if not bcrypt.checkpw(data.current_password.encode(), row["password_hash"].encode()):
            raise HTTPException(401, "Mot de passe actuel incorrect")
        new_hash = bcrypt.hashpw(data.new_password.encode(), bcrypt.gensalt()).decode()
        await conn.execute("UPDATE users SET password_hash=$1 WHERE username=$2", new_hash, user)
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        await conn.close()

# ── Routes admin — activité ─────────────────────────

@app.get("/activity")
async def get_activity(user: str = Depends(require_admin)):
    return load_json(ACTIVITY_FILE, [])
