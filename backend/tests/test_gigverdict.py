"""Comprehensive backend regression tests for GigVerdict."""
import os
import base64
import io
import pytest

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://offer-intel-2.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"


# ------------------------------------------------------------------
# Auth
# ------------------------------------------------------------------
class TestAuth:
    def test_root(self, api_client):
        r = api_client.get(f"{API}/")
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_me_with_valid_token(self, api_client):
        r = api_client.get(f"{API}/auth/me")
        assert r.status_code == 200
        u = r.json().get("user")
        assert u and u.get("email") == "demo@gigverdict.app"
        assert u.get("user_id") == "user_demo000000001"

    def test_me_missing_bearer_returns_401(self, unauth_client):
        r = unauth_client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_invalid_bearer_returns_401(self, unauth_client):
        unauth_client.headers.update({"Authorization": "Bearer bogus-token-xxxx"})
        r = unauth_client.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_session_rejects_bad_session_id(self, unauth_client):
        r = unauth_client.post(f"{API}/auth/session", json={"session_id": "invalid-fake-session-id"})
        assert r.status_code == 401


# ------------------------------------------------------------------
# Dashboard
# ------------------------------------------------------------------
class TestDashboard:
    def test_dashboard_shape(self, api_client):
        r = api_client.get(f"{API}/dashboard")
        assert r.status_code == 200
        data = r.json()
        for k in ("active_shift", "active_metrics", "today", "best_zone", "preset"):
            assert k in data
        assert "gross" in data["today"] and "net" in data["today"]
        assert "goal" in data["today"] and "goal_progress" in data["today"]


# ------------------------------------------------------------------
# Verdict engine
# ------------------------------------------------------------------
class TestVerdict:
    def test_strong_offer_take(self, api_client):
        payload = {"payout": 11.26, "miles": 4.7, "minutes": 22,
                   "restaurant": "Chick-fil-A – 1960", "end_zone_type": "hot"}
        r = api_client.post(f"{API}/offers/score", json=payload)
        assert r.status_code == 200
        result = r.json()["result"]
        assert result["score"] >= 80
        assert result["verdict"] == "take"
        assert isinstance(result["reasons"], list) and len(result["reasons"]) > 0
        # calc sanity
        assert result["gross_per_mile"] == round(11.26 / 4.7, 2)
        assert result["gross_hourly"] == round(11.26 / (22 / 60.0), 2)

    def test_weak_offer_decline(self, api_client):
        payload = {"payout": 3.5, "miles": 8, "minutes": 30, "end_zone_type": "dead"}
        r = api_client.post(f"{API}/offers/score", json=payload)
        assert r.status_code == 200
        result = r.json()["result"]
        assert result["verdict"] == "decline"
        assert result["score"] < 60


# ------------------------------------------------------------------
# Offers CRUD
# ------------------------------------------------------------------
class TestOffers:
    saved_id = None

    def test_save_offer(self, api_client):
        payload = {"payout": 9.5, "miles": 3.2, "minutes": 18,
                   "restaurant": "TEST_Pizza Palace", "end_zone_type": "neutral"}
        r = api_client.post(f"{API}/offers", json=payload)
        assert r.status_code == 200
        body = r.json()
        assert "offer" in body and "result" in body
        oid = body["offer"]["id"]
        assert oid.startswith("offer_")
        TestOffers.saved_id = oid
        assert "_id" not in body["offer"]

    def test_decision(self, api_client):
        assert TestOffers.saved_id, "requires previous save"
        r = api_client.post(f"{API}/offers/{TestOffers.saved_id}/decision",
                            json={"decision": "accepted"})
        assert r.status_code == 200

    def test_decision_invalid_offer(self, api_client):
        r = api_client.post(f"{API}/offers/does-not-exist/decision",
                            json={"decision": "accepted"})
        assert r.status_code == 404

    def test_list_offers_no_mongo_id(self, api_client):
        r = api_client.get(f"{API}/offers")
        assert r.status_code == 200
        offers = r.json()["offers"]
        assert isinstance(offers, list) and len(offers) > 0
        for o in offers[:5]:
            assert "_id" not in o
            assert "id" in o and "score" in o and "verdict" in o


# ------------------------------------------------------------------
# Shifts
# ------------------------------------------------------------------
class TestShifts:
    def test_list_shifts(self, api_client):
        r = api_client.get(f"{API}/shifts")
        assert r.status_code == 200
        shifts = r.json()["shifts"]
        assert isinstance(shifts, list)
        if shifts:
            for s in shifts[:3]:
                assert "_id" not in s
                assert "metrics" in s

    def test_start_shift_idempotent(self, api_client):
        r1 = api_client.post(f"{API}/shifts/start")
        assert r1.status_code == 200
        s1 = r1.json()["shift"]
        r2 = api_client.post(f"{API}/shifts/start")
        assert r2.status_code == 200
        s2 = r2.json()["shift"]
        assert s1["id"] == s2["id"], "start should be idempotent when active shift exists"

    def test_active_shift_metrics(self, api_client):
        r = api_client.get(f"{API}/shifts/active")
        assert r.status_code == 200
        body = r.json()
        assert body["shift"] is not None
        assert "metrics" in body
        assert "per_hour_net" in body["metrics"]

    def test_today_summary(self, api_client):
        r = api_client.get(f"{API}/shifts/today")
        assert r.status_code == 200
        body = r.json()
        for k in ("gross", "net", "goal", "goal_progress", "goal_remaining"):
            assert k in body


# ------------------------------------------------------------------
# Deliveries + Restaurants
# ------------------------------------------------------------------
class TestDeliveriesRestaurants:
    def test_create_delivery_and_list(self, api_client):
        payload = {"restaurant": "TEST_Diner", "payout": 8.5, "miles": 2.5,
                   "minutes": 15, "actual_wait": 4.0}
        r = api_client.post(f"{API}/deliveries", json=payload)
        assert r.status_code == 200
        d = r.json()["delivery"]
        assert d["id"].startswith("del_")

        r2 = api_client.get(f"{API}/deliveries")
        assert r2.status_code == 200
        assert any(x["id"] == d["id"] for x in r2.json()["deliveries"])

    def test_restaurants_intel(self, api_client):
        r = api_client.get(f"{API}/restaurants")
        assert r.status_code == 200
        rests = r.json()["restaurants"]
        assert isinstance(rests, list) and len(rests) > 0
        first = rests[0]
        for k in ("restaurant", "pickups", "avg_wait", "median_wait", "avg_hourly", "delay_penalty"):
            assert k in first


# ------------------------------------------------------------------
# Zones
# ------------------------------------------------------------------
class TestZones:
    zone_id = None

    def test_list_zones(self, api_client):
        r = api_client.get(f"{API}/zones")
        assert r.status_code == 200
        assert isinstance(r.json()["zones"], list)

    def test_create_zone(self, api_client):
        r = api_client.post(f"{API}/zones", json={
            "name": "TEST_Zone", "type": "hot", "lat": 30.0, "lng": -95.5,
            "radius_miles": 1.0
        })
        assert r.status_code == 200
        z = r.json()["zone"]
        assert z["id"].startswith("zone_")
        TestZones.zone_id = z["id"]

    def test_update_zone(self, api_client):
        assert TestZones.zone_id
        r = api_client.put(f"{API}/zones/{TestZones.zone_id}", json={
            "name": "TEST_Zone_Renamed", "type": "hot", "lat": 30.0, "lng": -95.5,
            "radius_miles": 1.2
        })
        assert r.status_code == 200
        assert r.json()["zone"]["name"] == "TEST_Zone_Renamed"

    def test_delete_zone_soft(self, api_client):
        assert TestZones.zone_id
        r = api_client.delete(f"{API}/zones/{TestZones.zone_id}")
        assert r.status_code == 200
        r2 = api_client.get(f"{API}/zones")
        assert not any(z["id"] == TestZones.zone_id for z in r2.json()["zones"])

    def test_best_zone(self, api_client):
        r = api_client.get(f"{API}/zones/best")
        assert r.status_code == 200
        body = r.json()
        assert "best" in body and "suggestion" in body and "message" in body


# ------------------------------------------------------------------
# Analytics
# ------------------------------------------------------------------
class TestAnalytics:
    def test_time_intel(self, api_client):
        r = api_client.get(f"{API}/analytics/time")
        assert r.status_code == 200
        d = r.json()
        for k in ("by_day", "by_hour", "best_hour", "worst_hour"):
            assert k in d


# ------------------------------------------------------------------
# Settings + Goal
# ------------------------------------------------------------------
class TestSettingsGoal:
    def test_get_settings(self, api_client):
        r = api_client.get(f"{API}/settings")
        assert r.status_code == 200
        assert "min_payout" in r.json()

    def test_update_settings(self, api_client):
        r = api_client.put(f"{API}/settings", json={"fuel_price": 3.65})
        assert r.status_code == 200
        assert r.json()["fuel_price"] == 3.65

    @pytest.mark.parametrize("preset", ["aggressive", "balanced", "selective"])
    def test_preset(self, api_client, preset):
        r = api_client.post(f"{API}/settings/preset/{preset}")
        assert r.status_code == 200
        assert r.json()["preset"] == preset

    def test_preset_invalid(self, api_client):
        r = api_client.post(f"{API}/settings/preset/nope")
        assert r.status_code == 400

    def test_goal_get_put(self, api_client):
        r = api_client.put(f"{API}/goal", json={"daily_goal": 425.0})
        assert r.status_code == 200
        r2 = api_client.get(f"{API}/goal")
        assert r2.status_code == 200
        assert r2.json()["daily_goal"] == 425.0
        # restore
        api_client.put(f"{API}/goal", json={"daily_goal": 500.0})


# ------------------------------------------------------------------
# AI scan (best-effort — allow graceful 502)
# ------------------------------------------------------------------
class TestScan:
    def test_scan_realistic_image(self, api_client):
        try:
            from PIL import Image, ImageDraw
        except Exception:
            pytest.skip("PIL not available")
        img = Image.new("RGB", (600, 900), color=(20, 20, 20))
        d = ImageDraw.Draw(img)
        d.rectangle([(0, 0), (600, 90)], fill=(0, 0, 0))
        d.text((20, 30), "Uber Eats — Delivery", fill=(255, 255, 255))
        d.text((20, 130), "$11.26", fill=(255, 255, 255))
        d.text((20, 200), "4.7 mi total", fill=(230, 230, 230))
        d.text((20, 260), "22 min estimated", fill=(230, 230, 230))
        d.text((20, 340), "Pickup: Wingstop – Louetta", fill=(255, 240, 200))
        d.text((20, 400), "Dropoff: Vintage Park", fill=(220, 220, 220))
        d.text((20, 480), "1 stop", fill=(200, 200, 200))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=85)
        b64 = base64.b64encode(buf.getvalue()).decode()

        r = api_client.post(f"{API}/offers/scan",
                            json={"image_base64": b64, "mime_type": "image/jpeg"},
                            timeout=90)
        # 502 acceptable per problem statement; 500 is a bug
        assert r.status_code in (200, 502), f"Got {r.status_code}: {r.text[:300]}"
        if r.status_code == 200:
            ex = r.json().get("extracted", {})
            assert "platform" in ex
