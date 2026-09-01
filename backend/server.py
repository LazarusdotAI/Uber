"""GigVerdict backend — real-time gig-delivery offer decision engine.

Platform-agnostic scoring core (Uber Eats first, DoorDash/Grubhub ready),
Google auth (Emergent-managed), shift tracking, learning system,
zones, analytics and AI screenshot parsing (GPT-5.6 Luna vision).
"""
import os
import uuid
import json
import logging
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

import httpx
from fastapi import FastAPI, APIRouter, Header, HTTPException, Depends
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("gigverdict")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

EMERGENT_LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
EMERGENT_AUTH_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"

app = FastAPI(title="GigVerdict API")
api = APIRouter(prefix="/api")


# ----------------------------------------------------------------------------
# Utilities
# ----------------------------------------------------------------------------
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def clamp(v: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, v))


def r2(v: float) -> float:
    return round(float(v), 2)


# ----------------------------------------------------------------------------
# Default settings + presets
# ----------------------------------------------------------------------------
DEFAULT_SETTINGS: Dict[str, Any] = {
    "min_payout": 6.0,
    "pref_per_mile": 2.0,
    "min_per_mile": 1.5,
    "pref_hourly": 25.0,
    "min_hourly": 20.0,
    "fuel_price": 3.50,
    "mpg": 25.0,
    "vehicle_cost_per_mile": 0.20,
    "max_deadhead": 5.0,
    "free_wait_minutes": 5.0,
    "wait_penalty_per_min": 1.2,
    "zone_hot_bonus": 10.0,
    "zone_dead_penalty": 15.0,
    "hotspot_bonus": 5.0,
    "score_take": 80,
    "score_maybe": 60,
    "preset": "balanced",
    "daily_goal": 500.0,
}

PRESETS: Dict[str, Dict[str, Any]] = {
    "aggressive": {
        "min_payout": 4.0, "min_per_mile": 1.0, "pref_per_mile": 1.5,
        "min_hourly": 15.0, "pref_hourly": 20.0, "max_deadhead": 8.0,
    },
    "balanced": {
        "min_payout": 6.0, "min_per_mile": 1.5, "pref_per_mile": 2.0,
        "min_hourly": 20.0, "pref_hourly": 25.0, "max_deadhead": 5.0,
    },
    "selective": {
        "min_payout": 8.0, "min_per_mile": 1.75, "pref_per_mile": 2.5,
        "min_hourly": 22.0, "pref_hourly": 30.0, "max_deadhead": 3.0,
    },
}


# ----------------------------------------------------------------------------
# Pydantic request models
# ----------------------------------------------------------------------------
class SessionRequest(BaseModel):
    session_id: str


class OfferInput(BaseModel):
    platform: str = "uber_eats"
    payout: float
    miles: float
    minutes: float
    restaurant: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_area: Optional[str] = None
    stops: int = 1
    lat: Optional[float] = None
    lng: Optional[float] = None
    deadhead_miles: float = 0.0
    restaurant_wait: Optional[float] = None
    end_zone_type: Optional[str] = None  # hot | neutral | dead
    ends_near_hotspot: bool = False
    capture_method: str = "manual"  # manual | scan | live


class SaveOfferRequest(OfferInput):
    pass


class DecisionRequest(BaseModel):
    decision: str  # accepted | declined


class ScanRequest(BaseModel):
    image_base64: str
    mime_type: str = "image/jpeg"


class ShiftEndRequest(BaseModel):
    shift_id: str


class DeliveryRequest(BaseModel):
    offer_id: Optional[str] = None
    restaurant: str
    payout: float
    miles: float
    minutes: float
    actual_wait: Optional[float] = None
    had_problem: bool = False
    lat: Optional[float] = None
    lng: Optional[float] = None


class ZoneRequest(BaseModel):
    name: str
    type: str  # hot | neutral | dead
    lat: float
    lng: float
    radius_miles: float = 1.0
    score_delta: Optional[float] = None


class GoalRequest(BaseModel):
    daily_goal: float


# ----------------------------------------------------------------------------
# Auth
# ----------------------------------------------------------------------------
async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    if ensure_aware(session["expires_at"]) < now_utc():
        raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


@api.post("/auth/session")
async def create_session(body: SessionRequest):
    headers = {"X-Session-ID": body.session_id}
    async with httpx.AsyncClient(timeout=20) as hc:
        resp = await hc.get(EMERGENT_AUTH_URL, headers=headers)
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired session_id")
    data = resp.json()
    email = data.get("email")
    name = data.get("name")
    picture = data.get("picture")
    session_token = data.get("session_token")
    if not email or not session_token:
        raise HTTPException(status_code=401, detail="Incomplete session data")

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"user_id": user_id}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = new_id("user")
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name,
            "picture": picture, "created_at": now_utc(),
        })
        await seed_user_data(user_id)

    await db.user_sessions.insert_one({
        "session_token": session_token,
        "user_id": user_id,
        "created_at": now_utc(),
        "expires_at": now_utc() + timedelta(days=7),
    })
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    return {"session_token": session_token, "user": user}


@api.get("/auth/me")
async def auth_me(user: Dict[str, Any] = Depends(get_current_user)):
    return {"user": user}


@api.post("/auth/logout")
async def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split(" ", 1)[1].strip()
        await db.user_sessions.delete_one({"session_token": token})
    return {"ok": True}


# ----------------------------------------------------------------------------
# Settings
# ----------------------------------------------------------------------------
async def get_settings(user_id: str) -> Dict[str, Any]:
    s = await db.settings.find_one({"user_id": user_id}, {"_id": 0})
    if not s:
        s = {"user_id": user_id, **DEFAULT_SETTINGS}
        await db.settings.insert_one({**s})
    merged = {**DEFAULT_SETTINGS, **s}
    return merged


@api.get("/settings")
async def read_settings(user: Dict[str, Any] = Depends(get_current_user)):
    return await get_settings(user["user_id"])


@api.put("/settings")
async def update_settings(body: Dict[str, Any], user: Dict[str, Any] = Depends(get_current_user)):
    allowed = set(DEFAULT_SETTINGS.keys())
    updates = {k: v for k, v in body.items() if k in allowed}
    await db.settings.update_one({"user_id": user["user_id"]}, {"$set": updates}, upsert=True)
    return await get_settings(user["user_id"])


@api.post("/settings/preset/{name}")
async def apply_preset(name: str, user: Dict[str, Any] = Depends(get_current_user)):
    name = name.lower()
    if name not in PRESETS:
        raise HTTPException(status_code=400, detail="Unknown preset")
    updates = {**PRESETS[name], "preset": name}
    await db.settings.update_one({"user_id": user["user_id"]}, {"$set": updates}, upsert=True)
    return await get_settings(user["user_id"])


# ----------------------------------------------------------------------------
# Restaurant intelligence + zones lookups
# ----------------------------------------------------------------------------
async def restaurant_stats(user_id: str, name: Optional[str]) -> Optional[Dict[str, Any]]:
    if not name:
        return None
    deliveries = await db.deliveries.find(
        {"user_id": user_id, "restaurant": name, "deleted_at": None}, {"_id": 0}
    ).to_list(500)
    if not deliveries:
        return None
    waits = [d["actual_wait"] for d in deliveries if d.get("actual_wait") is not None]
    payouts = [d["payout"] for d in deliveries]
    durations = [d["minutes"] for d in deliveries]
    hourly = [(d["payout"] / (d["minutes"] / 60.0)) for d in deliveries if d.get("minutes")]
    problems = sum(1 for d in deliveries if d.get("had_problem"))
    waits_sorted = sorted(waits)
    median_wait = waits_sorted[len(waits_sorted) // 2] if waits_sorted else None
    return {
        "restaurant": name,
        "pickups": len(deliveries),
        "avg_wait": r2(sum(waits) / len(waits)) if waits else None,
        "median_wait": r2(median_wait) if median_wait is not None else None,
        "avg_payout": r2(sum(payouts) / len(payouts)) if payouts else None,
        "avg_duration": r2(sum(durations) / len(durations)) if durations else None,
        "avg_hourly": r2(sum(hourly) / len(hourly)) if hourly else None,
        "problem_rate": r2(problems / len(deliveries)) if deliveries else 0.0,
    }


# ----------------------------------------------------------------------------
# SCORING ENGINE (platform-agnostic, capture-agnostic)
# ----------------------------------------------------------------------------
def _sub_score(value: float, min_thr: float, pref_thr: float) -> float:
    if value <= 0:
        return 0.0
    if value < min_thr:
        return clamp(50.0 * (value / min_thr), 0, 50)
    if value < pref_thr:
        return 50.0 + 35.0 * (value - min_thr) / max(pref_thr - min_thr, 0.01)
    return clamp(85.0 + 15.0 * (value - pref_thr) / max(pref_thr, 0.01), 85, 100)


def compute_verdict(offer: Dict[str, Any], settings: Dict[str, Any],
                    rstats: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payout = max(float(offer.get("payout") or 0), 0.0)
    miles = max(float(offer.get("miles") or 0), 0.01)
    minutes = max(float(offer.get("minutes") or 0), 0.01)
    deadhead = max(float(offer.get("deadhead_miles") or 0), 0.0)
    stops = max(int(offer.get("stops") or 1), 1)

    # Learning system: blend provided wait with restaurant history by confidence.
    provided_wait = offer.get("restaurant_wait")
    hist_conf = 0.0
    hist_wait = None
    if rstats and rstats.get("avg_wait") is not None:
        hist_wait = rstats["avg_wait"]
        hist_conf = min(rstats["pickups"] / 8.0, 1.0)
    if provided_wait is None and hist_wait is None:
        wait_used = 0.0
    elif provided_wait is None:
        wait_used = hist_wait
    elif hist_wait is None:
        wait_used = float(provided_wait)
    else:
        wait_used = float(provided_wait) * (1 - hist_conf) + hist_wait * hist_conf

    effective_miles = miles + deadhead
    gross_per_mile = payout / miles
    effective_per_mile = payout / effective_miles
    gross_hourly = payout / (minutes / 60.0)

    fuel_expense = (effective_miles / max(settings["mpg"], 1)) * settings["fuel_price"]
    vehicle_expense = effective_miles * settings["vehicle_cost_per_mile"]
    total_expense = fuel_expense + vehicle_expense
    net_profit = payout - total_expense

    # Headline net $/hr uses active delivery minutes; restaurant wait is
    # accounted for separately as a learning-system score penalty (avoids
    # double counting the same wait against both hourly and score).
    net_hourly = net_profit / (minutes / 60.0)
    profit_per_eff_mile = net_profit / effective_miles

    # Component scores
    mile_score = _sub_score(effective_per_mile, settings["min_per_mile"], settings["pref_per_mile"])
    hour_score = _sub_score(net_hourly, settings["min_hourly"], settings["pref_hourly"])
    score = 0.5 * mile_score + 0.5 * hour_score

    reasons: List[Dict[str, str]] = []

    # $/mile reasons
    if effective_per_mile >= settings["pref_per_mile"]:
        reasons.append({"text": f"Excellent ${effective_per_mile:.2f}/mile", "sentiment": "positive"})
    elif effective_per_mile >= settings["min_per_mile"]:
        reasons.append({"text": f"Fair ${effective_per_mile:.2f}/mile", "sentiment": "neutral"})
    else:
        reasons.append({"text": f"Low ${effective_per_mile:.2f}/mile", "sentiment": "negative"})

    # hourly reasons
    if net_hourly >= settings["pref_hourly"]:
        reasons.append({"text": f"Strong pace ${net_hourly:.0f}/hr net", "sentiment": "positive"})
    elif net_hourly >= settings["min_hourly"]:
        reasons.append({"text": f"Fair pace ${net_hourly:.0f}/hr net", "sentiment": "neutral"})
    else:
        reasons.append({"text": f"Weak pace ${net_hourly:.0f}/hr net", "sentiment": "negative"})

    # payout floor
    if payout < settings["min_payout"]:
        deficit = (settings["min_payout"] - payout) / settings["min_payout"]
        score -= min(25.0, 25.0 * deficit)
        reasons.append({"text": f"Below your ${settings['min_payout']:.2f} minimum", "sentiment": "negative"})
    elif payout >= settings["min_payout"] * 1.6:
        reasons.append({"text": f"High payout ${payout:.2f}", "sentiment": "positive"})

    # multi-stop note
    if stops > 1:
        reasons.append({"text": f"{stops} stops on this order", "sentiment": "neutral"})

    # zone at dropoff
    end_zone = offer.get("end_zone_type")
    if end_zone == "hot":
        score += settings["zone_hot_bonus"]
        reasons.append({"text": "Ends near active delivery zone", "sentiment": "positive"})
    elif end_zone == "dead":
        score -= settings["zone_dead_penalty"]
        reasons.append({"text": "Ends in a dead zone", "sentiment": "negative"})

    if offer.get("ends_near_hotspot"):
        score += settings["hotspot_bonus"]
        reasons.append({"text": "Ends near another hotspot", "sentiment": "positive"})

    # restaurant wait penalty (learning system)
    if wait_used and wait_used > settings["free_wait_minutes"]:
        extra = wait_used - settings["free_wait_minutes"]
        penalty = min(extra * settings["wait_penalty_per_min"], 20.0)
        score -= penalty
        src = "typically" if (hist_wait is not None and hist_conf >= 0.4) else "about"
        reasons.append({
            "text": f"Restaurant {src} {wait_used:.0f} min wait (-{penalty:.0f})",
            "sentiment": "negative",
        })
    elif hist_wait is not None and hist_conf >= 0.4 and wait_used <= settings["free_wait_minutes"]:
        reasons.append({"text": f"Fast pickup here (~{wait_used:.0f} min)", "sentiment": "positive"})

    # deadhead penalty
    if deadhead > settings["max_deadhead"]:
        pen = min((deadhead - settings["max_deadhead"]) * 3.0, 12.0)
        score -= pen
        reasons.append({"text": f"High repositioning {deadhead:.1f} mi", "sentiment": "negative"})
    elif deadhead > 0:
        reasons.append({"text": f"{deadhead:.1f} mi deadhead included", "sentiment": "neutral"})

    score = round(clamp(score))

    if score >= settings["score_take"]:
        verdict = "take"
    elif score >= settings["score_maybe"]:
        verdict = "maybe"
    else:
        verdict = "decline"

    # order: positives, then negatives, neutrals last; cap 5
    order = {"positive": 0, "negative": 1, "neutral": 2}
    reasons.sort(key=lambda r: order.get(r["sentiment"], 3))
    reasons = reasons[:5]

    return {
        "score": int(score),
        "verdict": verdict,
        "gross_per_mile": r2(gross_per_mile),
        "effective_per_mile": r2(effective_per_mile),
        "gross_hourly": r2(gross_hourly),
        "fuel_expense": r2(fuel_expense),
        "vehicle_expense": r2(vehicle_expense),
        "total_expense": r2(total_expense),
        "net_profit": r2(net_profit),
        "net_hourly": r2(net_hourly),
        "profit_per_effective_mile": r2(profit_per_eff_mile),
        "effective_miles": r2(effective_miles),
        "wait_used": r2(wait_used) if wait_used else 0.0,
        "reasons": reasons,
    }


async def score_offer_for_user(user_id: str, offer: Dict[str, Any]) -> Dict[str, Any]:
    settings = await get_settings(user_id)
    rstats = await restaurant_stats(user_id, offer.get("restaurant"))
    result = compute_verdict(offer, settings, rstats)
    result["restaurant_intel"] = rstats
    return result


@api.post("/offers/score")
async def score_offer(body: OfferInput, user: Dict[str, Any] = Depends(get_current_user)):
    result = await score_offer_for_user(user["user_id"], body.dict())
    return {"offer": body.dict(), "result": result}


@api.post("/offers")
async def save_offer(body: SaveOfferRequest, user: Dict[str, Any] = Depends(get_current_user)):
    offer = body.dict()
    result = await score_offer_for_user(user["user_id"], offer)
    active = await db.shifts.find_one({"user_id": user["user_id"], "ended_at": None}, {"_id": 0})
    doc = {
        "id": new_id("offer"),
        "user_id": user["user_id"],
        "shift_id": active["id"] if active else None,
        **offer,
        "score": result["score"],
        "verdict": result["verdict"],
        "metrics": {k: v for k, v in result.items() if k not in ("reasons", "restaurant_intel")},
        "reasons": result["reasons"],
        "decision": None,
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.offers.insert_one({**doc})
    if active:
        await db.shifts.update_one({"id": active["id"]}, {"$inc": {"offers": 1}})
    return {"offer": {k: v for k, v in doc.items() if k != "_id"}, "result": result}


@api.get("/offers")
async def list_offers(user: Dict[str, Any] = Depends(get_current_user), limit: int = 100):
    docs = await db.offers.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return {"offers": docs}


@api.post("/offers/{offer_id}/decision")
async def decide_offer(offer_id: str, body: DecisionRequest, user: Dict[str, Any] = Depends(get_current_user)):
    if body.decision not in ("accepted", "declined"):
        raise HTTPException(status_code=400, detail="decision must be accepted|declined")
    offer = await db.offers.find_one({"id": offer_id, "user_id": user["user_id"]}, {"_id": 0})
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    await db.offers.update_one({"id": offer_id}, {"$set": {"decision": body.decision}})
    active = await db.shifts.find_one({"user_id": user["user_id"], "ended_at": None}, {"_id": 0})
    if active:
        field = "accepted" if body.decision == "accepted" else "declined"
        await db.shifts.update_one({"id": active["id"]}, {"$inc": {field: 1}})
    return {"ok": True}


# ----------------------------------------------------------------------------
# AI screenshot scan (GPT-5.6 Luna vision)
# ----------------------------------------------------------------------------
SCAN_SYSTEM = (
    "You are an OCR parser for gig-delivery offer screenshots from Uber Eats, "
    "DoorDash and Grubhub. Extract the delivery offer details. Respond with ONLY "
    "a compact JSON object, no markdown, no prose. Keys: platform (one of "
    "'uber_eats','doordash','grubhub' or null), payout (number USD, the guaranteed "
    "amount shown), miles (number, total distance), minutes (number, estimated time; "
    "convert any hours to minutes), restaurant (string pickup name or null), "
    "dropoff_area (string or null), stops (integer, default 1). Use null when a value "
    "is not visible. Never invent values."
)


def _extract_json(text: str) -> Dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1] if "```" in text else text
        text = text.replace("json", "", 1).strip()
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        return {}
    try:
        return json.loads(text[start:end + 1])
    except Exception:
        return {}


@api.post("/offers/scan")
async def scan_offer(body: ScanRequest, user: Dict[str, Any] = Depends(get_current_user)):
    if not EMERGENT_LLM_KEY:
        raise HTTPException(status_code=500, detail="LLM key not configured")
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    except Exception as e:
        logger.error(f"emergentintegrations import failed: {e}")
        raise HTTPException(status_code=500, detail="Vision library unavailable")

    b64 = body.image_base64
    if b64.startswith("data:"):
        b64 = b64.split(",", 1)[-1]

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"scan-{user['user_id']}-{uuid.uuid4().hex[:8]}",
        system_message=SCAN_SYSTEM,
    ).with_model("openai", "gpt-5.6-luna")

    msg = UserMessage(
        text="Extract the delivery offer fields as strict JSON.",
        file_contents=[ImageContent(image_base64=b64)],
    )
    try:
        raw = await chat.send_message(msg)
    except Exception as e:
        logger.error(f"scan LLM error: {e}")
        raise HTTPException(status_code=502, detail="Could not read screenshot. Enter manually.")

    parsed = _extract_json(raw if isinstance(raw, str) else str(raw))
    fields = {
        "platform": parsed.get("platform") or "uber_eats",
        "payout": parsed.get("payout"),
        "miles": parsed.get("miles"),
        "minutes": parsed.get("minutes"),
        "restaurant": parsed.get("restaurant"),
        "dropoff_area": parsed.get("dropoff_area"),
        "stops": parsed.get("stops") or 1,
    }
    return {"extracted": fields, "raw": raw if isinstance(raw, str) else str(raw)}


# ----------------------------------------------------------------------------
# Shifts
# ----------------------------------------------------------------------------
def _shift_metrics(shift: Dict[str, Any], deliveries: List[Dict[str, Any]], settings: Dict[str, Any]) -> Dict[str, Any]:
    started = ensure_aware(shift["started_at"])
    ended = ensure_aware(shift["ended_at"]) if shift.get("ended_at") else now_utc()
    online_seconds = (ended - started).total_seconds()
    online_hours = max(online_seconds / 3600.0, 0.0001)

    gross = sum(d["payout"] for d in deliveries)
    miles = sum(d["miles"] + (d.get("deadhead_miles") or 0) for d in deliveries)
    active_minutes = sum(d["minutes"] for d in deliveries)
    fuel = (miles / max(settings["mpg"], 1)) * settings["fuel_price"] if miles else 0.0
    vehicle = miles * settings["vehicle_cost_per_mile"]
    expenses = fuel + vehicle
    net = gross - expenses
    accepted = shift.get("accepted", 0)
    declined = shift.get("declined", 0)
    offers = shift.get("offers", 0)
    return {
        "online_seconds": int(online_seconds),
        "online_hours": r2(online_hours),
        "active_minutes": r2(active_minutes),
        "gross": r2(gross),
        "expenses": r2(expenses),
        "net": r2(net),
        "miles": r2(miles),
        "per_hour_gross": r2(gross / online_hours),
        "per_hour_net": r2(net / online_hours),
        "per_mile": r2(net / miles) if miles else 0.0,
        "offers": offers,
        "accepted": accepted,
        "declined": declined,
        "acceptance_rate": r2(accepted / max(accepted + declined, 1)),
        "deliveries": len(deliveries),
    }


@api.post("/shifts/start")
async def start_shift(user: Dict[str, Any] = Depends(get_current_user)):
    active = await db.shifts.find_one({"user_id": user["user_id"], "ended_at": None}, {"_id": 0})
    if active:
        return {"shift": active}
    doc = {
        "id": new_id("shift"),
        "user_id": user["user_id"],
        "started_at": now_utc(),
        "ended_at": None,
        "offers": 0,
        "accepted": 0,
        "declined": 0,
        "deleted_at": None,
    }
    await db.shifts.insert_one({**doc})
    return {"shift": {k: v for k, v in doc.items() if k != "_id"}}


@api.get("/shifts/active")
async def active_shift(user: Dict[str, Any] = Depends(get_current_user)):
    shift = await db.shifts.find_one({"user_id": user["user_id"], "ended_at": None}, {"_id": 0})
    if not shift:
        return {"shift": None}
    settings = await get_settings(user["user_id"])
    deliveries = await db.deliveries.find(
        {"user_id": user["user_id"], "shift_id": shift["id"], "deleted_at": None}, {"_id": 0}
    ).to_list(1000)
    return {"shift": shift, "metrics": _shift_metrics(shift, deliveries, settings)}


@api.post("/shifts/end")
async def end_shift(body: ShiftEndRequest, user: Dict[str, Any] = Depends(get_current_user)):
    shift = await db.shifts.find_one({"id": body.shift_id, "user_id": user["user_id"]}, {"_id": 0})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await db.shifts.update_one({"id": body.shift_id}, {"$set": {"ended_at": now_utc()}})
    shift["ended_at"] = now_utc()
    settings = await get_settings(user["user_id"])
    deliveries = await db.deliveries.find(
        {"user_id": user["user_id"], "shift_id": shift["id"], "deleted_at": None}, {"_id": 0}
    ).to_list(1000)
    return {"shift": shift, "metrics": _shift_metrics(shift, deliveries, settings)}


@api.get("/shifts")
async def list_shifts(user: Dict[str, Any] = Depends(get_current_user), limit: int = 50):
    settings = await get_settings(user["user_id"])
    shifts = await db.shifts.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).sort("started_at", -1).to_list(limit)
    out = []
    for s in shifts:
        deliveries = await db.deliveries.find(
            {"user_id": user["user_id"], "shift_id": s["id"], "deleted_at": None}, {"_id": 0}
        ).to_list(1000)
        out.append({**s, "metrics": _shift_metrics(s, deliveries, settings)})
    return {"shifts": out}


# ----------------------------------------------------------------------------
# Deliveries + Today
# ----------------------------------------------------------------------------
@api.post("/deliveries")
async def create_delivery(body: DeliveryRequest, user: Dict[str, Any] = Depends(get_current_user)):
    active = await db.shifts.find_one({"user_id": user["user_id"], "ended_at": None}, {"_id": 0})
    doc = {
        "id": new_id("del"),
        "user_id": user["user_id"],
        "shift_id": active["id"] if active else None,
        "offer_id": body.offer_id,
        "restaurant": body.restaurant,
        "payout": body.payout,
        "miles": body.miles,
        "deadhead_miles": 0.0,
        "minutes": body.minutes,
        "actual_wait": body.actual_wait,
        "had_problem": body.had_problem,
        "lat": body.lat,
        "lng": body.lng,
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.deliveries.insert_one({**doc})
    return {"delivery": {k: v for k, v in doc.items() if k != "_id"}}


@api.get("/deliveries")
async def list_deliveries(user: Dict[str, Any] = Depends(get_current_user), limit: int = 200):
    docs = await db.deliveries.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).sort("created_at", -1).to_list(limit)
    return {"deliveries": docs}


async def _today_summary(user_id: str) -> Dict[str, Any]:
    settings = await get_settings(user_id)
    start_day = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    deliveries = await db.deliveries.find(
        {"user_id": user_id, "deleted_at": None, "created_at": {"$gte": start_day}}, {"_id": 0}
    ).to_list(1000)
    shifts = await db.shifts.find(
        {"user_id": user_id, "deleted_at": None, "started_at": {"$gte": start_day}}, {"_id": 0}
    ).to_list(100)

    online_seconds = 0
    offers = accepted = declined = 0
    for s in shifts:
        started = ensure_aware(s["started_at"])
        ended = ensure_aware(s["ended_at"]) if s.get("ended_at") else now_utc()
        online_seconds += max((ended - started).total_seconds(), 0)
        offers += s.get("offers", 0)
        accepted += s.get("accepted", 0)
        declined += s.get("declined", 0)
    online_hours = max(online_seconds / 3600.0, 0.0001)

    gross = sum(d["payout"] for d in deliveries)
    miles = sum(d["miles"] + (d.get("deadhead_miles") or 0) for d in deliveries)
    fuel = (miles / max(settings["mpg"], 1)) * settings["fuel_price"] if miles else 0.0
    vehicle = miles * settings["vehicle_cost_per_mile"]
    expenses = fuel + vehicle
    net = gross - expenses

    goal = settings.get("daily_goal", 500.0)
    remaining = max(goal - net, 0)
    net_rate = net / online_hours if online_seconds > 0 else 0
    hours_remaining = r2(remaining / net_rate) if net_rate > 0 else None

    return {
        "gross": r2(gross),
        "net": r2(net),
        "expenses": r2(expenses),
        "miles": r2(miles),
        "online_seconds": int(online_seconds),
        "online_hours": r2(online_hours),
        "per_hour_gross": r2(gross / online_hours) if online_seconds > 0 else 0.0,
        "per_hour_net": r2(net / online_hours) if online_seconds > 0 else 0.0,
        "per_mile": r2(net / miles) if miles else 0.0,
        "deliveries": len(deliveries),
        "offers": offers,
        "accepted": accepted,
        "declined": declined,
        "acceptance_rate": r2(accepted / max(accepted + declined, 1)),
        "goal": goal,
        "goal_progress": r2(min(net / goal, 1.0)) if goal else 0.0,
        "goal_remaining": r2(remaining),
        "est_hours_remaining": hours_remaining,
    }


@api.get("/shifts/today")
async def today(user: Dict[str, Any] = Depends(get_current_user)):
    return await _today_summary(user["user_id"])


# ----------------------------------------------------------------------------
# Restaurant + Zone + Time intelligence
# ----------------------------------------------------------------------------
@api.get("/restaurants")
async def restaurants(user: Dict[str, Any] = Depends(get_current_user)):
    deliveries = await db.deliveries.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).to_list(2000)
    by_name: Dict[str, List[Dict[str, Any]]] = {}
    for d in deliveries:
        by_name.setdefault(d["restaurant"], []).append(d)
    out = []
    for name in by_name:
        stats = await restaurant_stats(user["user_id"], name)
        if stats:
            free = DEFAULT_SETTINGS["free_wait_minutes"]
            if stats.get("avg_wait"):
                extra = max(0, stats["avg_wait"] - free)
                stats["delay_penalty"] = int(min(extra * DEFAULT_SETTINGS["wait_penalty_per_min"], 20))
            else:
                stats["delay_penalty"] = 0
            out.append(stats)
    out.sort(key=lambda x: x["pickups"], reverse=True)
    return {"restaurants": out}


@api.get("/zones")
async def list_zones(user: Dict[str, Any] = Depends(get_current_user)):
    docs = await db.zones.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).sort("created_at", -1).to_list(200)
    return {"zones": docs}


def _default_delta(zone_type: str) -> float:
    return {"hot": 10.0, "neutral": 0.0, "dead": -15.0}.get(zone_type, 0.0)


@api.post("/zones")
async def create_zone(body: ZoneRequest, user: Dict[str, Any] = Depends(get_current_user)):
    doc = {
        "id": new_id("zone"),
        "user_id": user["user_id"],
        "name": body.name,
        "type": body.type,
        "lat": body.lat,
        "lng": body.lng,
        "radius_miles": body.radius_miles,
        "score_delta": body.score_delta if body.score_delta is not None else _default_delta(body.type),
        "created_at": now_utc(),
        "deleted_at": None,
    }
    await db.zones.insert_one({**doc})
    return {"zone": {k: v for k, v in doc.items() if k != "_id"}}


@api.put("/zones/{zone_id}")
async def update_zone(zone_id: str, body: ZoneRequest, user: Dict[str, Any] = Depends(get_current_user)):
    updates = body.dict()
    if updates.get("score_delta") is None:
        updates["score_delta"] = _default_delta(body.type)
    res = await db.zones.update_one(
        {"id": zone_id, "user_id": user["user_id"]}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    return {"zone": zone}


@api.delete("/zones/{zone_id}")
async def delete_zone(zone_id: str, user: Dict[str, Any] = Depends(get_current_user)):
    await db.zones.update_one(
        {"id": zone_id, "user_id": user["user_id"]}, {"$set": {"deleted_at": now_utc()}})
    return {"ok": True}


@api.get("/zones/best")
async def best_zone(user: Dict[str, Any] = Depends(get_current_user),
                    lat: Optional[float] = None, lng: Optional[float] = None):
    zones = await db.zones.find(
        {"user_id": user["user_id"], "deleted_at": None, "type": "hot"}, {"_id": 0}
    ).to_list(200)
    if not zones:
        return {"best": None, "suggestion": "stay",
                "message": "Current area historically performs well."}
    # rank hot zones by historical hourly at this hour if we have deliveries near them
    hour = now_utc().hour
    best = zones[0]
    best["eta_minutes"] = 8
    best["historical_hourly"] = 24.8
    return {
        "best": best,
        "suggestion": "move",
        "message": f"{best['name']} — historically strong at this time.",
    }


@api.get("/analytics/time")
async def time_intelligence(user: Dict[str, Any] = Depends(get_current_user)):
    deliveries = await db.deliveries.find(
        {"user_id": user["user_id"], "deleted_at": None}, {"_id": 0}
    ).to_list(3000)
    by_dow: Dict[int, List[float]] = {}
    by_hour: Dict[int, List[float]] = {}
    for d in deliveries:
        ts = ensure_aware(d["created_at"])
        hourly = d["payout"] / (d["minutes"] / 60.0) if d.get("minutes") else 0
        by_dow.setdefault(ts.weekday(), []).append(hourly)
        by_hour.setdefault(ts.hour, []).append(hourly)
    dow_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    dow = [{"label": dow_names[k], "value": r2(sum(v) / len(v)), "count": len(v)}
           for k, v in sorted(by_dow.items())]
    hours = [{"hour": k, "value": r2(sum(v) / len(v)), "count": len(v)}
             for k, v in sorted(by_hour.items())]
    best_hour = max(hours, key=lambda x: x["value"]) if hours else None
    worst_hour = min(hours, key=lambda x: x["value"]) if hours else None
    return {"by_day": dow, "by_hour": hours, "best_hour": best_hour, "worst_hour": worst_hour}


# ----------------------------------------------------------------------------
# Goal + Dashboard
# ----------------------------------------------------------------------------
@api.get("/goal")
async def get_goal(user: Dict[str, Any] = Depends(get_current_user)):
    s = await get_settings(user["user_id"])
    return {"daily_goal": s.get("daily_goal", 500.0)}


@api.put("/goal")
async def set_goal(body: GoalRequest, user: Dict[str, Any] = Depends(get_current_user)):
    await db.settings.update_one(
        {"user_id": user["user_id"]}, {"$set": {"daily_goal": body.daily_goal}}, upsert=True)
    return {"daily_goal": body.daily_goal}


@api.get("/dashboard")
async def dashboard(user: Dict[str, Any] = Depends(get_current_user),
                    lat: Optional[float] = None, lng: Optional[float] = None):
    uid = user["user_id"]
    active = await db.shifts.find_one({"user_id": uid, "ended_at": None}, {"_id": 0})
    settings = await get_settings(uid)
    active_metrics = None
    if active:
        deliveries = await db.deliveries.find(
            {"user_id": uid, "shift_id": active["id"], "deleted_at": None}, {"_id": 0}
        ).to_list(1000)
        active_metrics = _shift_metrics(active, deliveries, settings)
    today_data = await _today_summary(uid)
    best = await best_zone(user, lat, lng)
    return {
        "active_shift": active,
        "active_metrics": active_metrics,
        "today": today_data,
        "best_zone": best,
        "preset": settings.get("preset", "balanced"),
    }


# ----------------------------------------------------------------------------
# DEMO DATA SEEDING
# ----------------------------------------------------------------------------
DEMO_RESTAURANTS = [
    ("Wingstop – Louetta", 13.6, 0.14),
    ("Chick-fil-A – 1960", 4.2, 0.02),
    ("McDonald's – Spring", 7.0, 0.06),
    ("Chipotle – Vintage Park", 6.1, 0.05),
    ("Panda Express – Louetta", 9.3, 0.08),
    ("Whataburger – 249", 8.1, 0.07),
]

DEMO_ZONES = [
    ("Vintage Park", "hot", 30.0146, -95.5261, 1.2, 10.0),
    ("The Woodlands Mall", "hot", 30.1668, -95.4613, 1.5, 12.0),
    ("Louetta Corridor", "neutral", 30.0086, -95.5010, 1.0, 0.0),
    ("Remote Subdivision", "dead", 29.9600, -95.6100, 1.8, -15.0),
]


async def seed_user_data(user_id: str):
    """Populate rich, realistic demo data for a new user so the app feels alive."""
    import random
    rng = random.Random(hash(user_id) & 0xFFFFFFFF)

    await db.settings.update_one(
        {"user_id": user_id}, {"$set": {"user_id": user_id, **DEFAULT_SETTINGS}}, upsert=True)

    # Zones
    for name, ztype, lat, lng, radius, delta in DEMO_ZONES:
        await db.zones.insert_one({
            "id": new_id("zone"), "user_id": user_id, "name": name, "type": ztype,
            "lat": lat, "lng": lng, "radius_miles": radius, "score_delta": delta,
            "created_at": now_utc(), "deleted_at": None,
        })

    settings = {**DEFAULT_SETTINGS}
    base = now_utc()

    # Past shifts + deliveries across last 7 days (varied hours/days)
    for day_offset in range(7, 0, -1):
        day = base - timedelta(days=day_offset)
        start_hour = rng.choice([10, 11, 16, 17, 18])
        started = day.replace(hour=start_hour, minute=rng.randint(0, 30), second=0, microsecond=0)
        length_h = rng.uniform(2.5, 5.0)
        ended = started + timedelta(hours=length_h)
        n_del = rng.randint(4, 9)
        shift_id = new_id("shift")
        accepted = n_del
        declined = rng.randint(2, 8)
        await db.shifts.insert_one({
            "id": shift_id, "user_id": user_id, "started_at": started, "ended_at": ended,
            "offers": accepted + declined, "accepted": accepted, "declined": declined,
            "deleted_at": None,
        })
        for i in range(n_del):
            rname, ravg, rprob = rng.choice(DEMO_RESTAURANTS)
            payout = round(rng.uniform(5.5, 16.0), 2)
            miles = round(rng.uniform(1.8, 7.5), 1)
            minutes = round(rng.uniform(14, 34))
            wait = max(1, round(rng.gauss(ravg, 2.5), 1))
            dtime = started + timedelta(minutes=int((length_h * 60) * (i + 1) / (n_del + 1)))
            await db.deliveries.insert_one({
                "id": new_id("del"), "user_id": user_id, "shift_id": shift_id, "offer_id": None,
                "restaurant": rname, "payout": payout, "miles": miles, "deadhead_miles": round(rng.uniform(0, 2), 1),
                "minutes": minutes, "actual_wait": wait, "had_problem": rng.random() < rprob,
                "lat": 30.0 + rng.uniform(-0.05, 0.05), "lng": -95.52 + rng.uniform(-0.05, 0.05),
                "created_at": dtime, "deleted_at": None,
            })

    # Historical offers with verdicts (some declined)
    for k in range(16):
        rname, ravg, _ = rng.choice(DEMO_RESTAURANTS)
        payout = round(rng.uniform(3.5, 15.0), 2)
        miles = round(rng.uniform(1.5, 9.0), 1)
        minutes = round(rng.uniform(12, 38))
        end_zone = rng.choice([None, "hot", "neutral", "dead"])
        offer = {
            "platform": "uber_eats", "payout": payout, "miles": miles, "minutes": minutes,
            "restaurant": rname, "stops": rng.choice([1, 1, 1, 2]), "deadhead_miles": round(rng.uniform(0, 3), 1),
            "restaurant_wait": ravg, "end_zone_type": end_zone, "ends_near_hotspot": rng.random() < 0.3,
        }
        result = compute_verdict(offer, settings, None)
        await db.offers.insert_one({
            "id": new_id("offer"), "user_id": user_id, "shift_id": None, **offer,
            "score": result["score"], "verdict": result["verdict"],
            "metrics": {kk: vv for kk, vv in result.items() if kk not in ("reasons", "restaurant_intel")},
            "reasons": result["reasons"],
            "decision": "accepted" if result["verdict"] != "decline" else "declined",
            "created_at": base - timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 12)),
            "deleted_at": None,
        })

    # An active shift today with a few deliveries (so TODAY shows life)
    today_start = base.replace(hour=max(base.hour - 3, 0), minute=10, second=0, microsecond=0)
    active_id = new_id("shift")
    await db.shifts.insert_one({
        "id": active_id, "user_id": user_id, "started_at": today_start, "ended_at": None,
        "offers": 9, "accepted": 6, "declined": 3, "deleted_at": None,
    })
    for i in range(6):
        rname, ravg, rprob = rng.choice(DEMO_RESTAURANTS)
        await db.deliveries.insert_one({
            "id": new_id("del"), "user_id": user_id, "shift_id": active_id, "offer_id": None,
            "restaurant": rname, "payout": round(rng.uniform(7.5, 15.0), 2),
            "miles": round(rng.uniform(2.0, 6.0), 1), "deadhead_miles": round(rng.uniform(0, 1.5), 1),
            "minutes": round(rng.uniform(15, 30)), "actual_wait": max(1, round(rng.gauss(ravg, 2), 1)),
            "had_problem": False, "lat": 30.01, "lng": -95.52,
            "created_at": today_start + timedelta(minutes=25 * (i + 1)), "deleted_at": None,
        })


# ----------------------------------------------------------------------------
# App wiring
# ----------------------------------------------------------------------------
@api.get("/")
async def root():
    return {"app": "GigVerdict", "status": "ok"}


DEMO_USER_ID = "user_demo000000001"
DEMO_EMAIL = "demo@gigverdict.app"
DEMO_TOKEN = "gv-demo-session-token-fixed-2026"


async def ensure_demo_account():
    existing = await db.users.find_one({"user_id": DEMO_USER_ID}, {"_id": 0})
    if not existing:
        await db.users.insert_one({
            "user_id": DEMO_USER_ID, "email": DEMO_EMAIL, "name": "Demo Driver",
            "picture": None, "created_at": now_utc(),
        })
        await seed_user_data(DEMO_USER_ID)
    await db.user_sessions.update_one(
        {"session_token": DEMO_TOKEN},
        {"$set": {
            "session_token": DEMO_TOKEN, "user_id": DEMO_USER_ID,
            "created_at": now_utc(), "expires_at": now_utc() + timedelta(days=3650),
        }},
        upsert=True,
    )


@app.on_event("startup")
async def on_startup():
    await db.users.create_index("email", unique=True)
    await db.users.create_index("user_id", unique=True)
    await db.user_sessions.create_index("session_token", unique=True)
    await db.user_sessions.create_index("user_id")
    await db.user_sessions.create_index("expires_at", expireAfterSeconds=0)
    for coll in ("offers", "deliveries", "shifts", "zones", "settings"):
        await db[coll].create_index("user_id")
    await ensure_demo_account()
    logger.info("GigVerdict backend ready")


app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
