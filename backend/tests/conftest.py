import os
import requests
import pytest

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://offer-intel-2.preview.emergentagent.com").rstrip("/")
TOKEN = "gv-demo-session-token-fixed-2026"


@pytest.fixture(scope="session")
def base_url():
    return BASE_URL


@pytest.fixture(scope="session")
def token():
    return TOKEN


@pytest.fixture
def api_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json", "Authorization": f"Bearer {TOKEN}"})
    return s


@pytest.fixture
def unauth_client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s
