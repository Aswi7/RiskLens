import sys
import os
import io
import logging
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.abspath('.'))

from app.main import app
from app.features.llm.service import generate_chat_reply, call_llm_json


def run_p1_checks():
    print("=" * 70)
    print("RUNNING P1 SECURITY & INPUT VALIDATION VERIFICATION CHECKS")
    print("=" * 70)

    # Attach in-memory log stream to capture risklens logs during testing
    log_stream = io.StringIO()
    handler = logging.StreamHandler(log_stream)
    handler.setLevel(logging.DEBUG)
    logging.getLogger("risklens").addHandler(handler)

    with TestClient(app) as client:
        # Get valid demo token for authenticated testing
        demo_login_res = client.post("/auth/demo-login")
        assert demo_login_res.status_code == 200
        token = demo_login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 1. TEST INPUT VALIDATION ON /predict
        print("\n--- 1. Testing /predict Input Boundaries ---", flush=True)

        # 1a. Age = -5 -> Must be rejected with 422
        res_age = client.post("/predict", json={"Age": -5, "Sex": 1, "BMI": 25.0}, headers=auth_headers)
        print(f"  Age: -5 -> Status {res_age.status_code}", flush=True)
        assert res_age.status_code == 422, f"Expected 422 for Age=-5, got {res_age.status_code}"

        # 1b. BMI = 1000 -> Must be rejected with 422
        res_bmi = client.post("/predict", json={"Age": 45, "Sex": 1, "BMI": 1000.0}, headers=auth_headers)
        print(f"  BMI: 1000 -> Status {res_bmi.status_code}", flush=True)
        assert res_bmi.status_code == 422, f"Expected 422 for BMI=1000, got {res_bmi.status_code}"

        # 1c. NaN -> Must be rejected with 422
        nan_headers = {**auth_headers, "Content-Type": "application/json"}
        res_nan = client.post("/predict", content=b'{"Age": 45, "Sex": 1, "BMI": NaN}', headers=nan_headers)
        print(f"  BMI: NaN -> Status {res_nan.status_code}", flush=True)
        assert res_nan.status_code == 422, f"Expected 422 for NaN, got {res_nan.status_code}"

        # 1d. Infinity -> Must be rejected with 422
        res_inf = client.post("/predict", content=b'{"Age": 45, "Sex": 1, "BMI": Infinity}', headers=nan_headers)
        print(f"  BMI: Infinity -> Status {res_inf.status_code}", flush=True)
        assert res_inf.status_code == 422, f"Expected 422 for Infinity, got {res_inf.status_code}"

        # 2. TEST CHAT INPUT BOUNDARIES ON /chat
        print("\n--- 2. Testing /chat Boundaries ---", flush=True)

        # 2a. 2,000-character chat message -> Must be rejected with 422
        long_message = "A" * 2000
        res_long_msg = client.post("/chat", json={"message": long_message, "history": []}, headers=auth_headers)
        print(f"  2,000-char message -> Status {res_long_msg.status_code}", flush=True)
        assert res_long_msg.status_code == 422, f"Expected 422 for 2000-char message, got {res_long_msg.status_code}"

        # 2b. 30-message history -> Must be rejected with 422
        large_history = [{"role": "user", "content": f"Message {i}"} for i in range(30)]
        res_large_hist = client.post("/chat", json={"message": "Can you summarize?", "history": large_history}, headers=auth_headers)
        print(f"  30-message history -> Status {res_large_hist.status_code}", flush=True)
        assert res_large_hist.status_code == 422, f"Expected 422 for 30-message history, got {res_large_hist.status_code}"

        # 3. TEST /health ERROR SANITIZATION
        print("\n--- 3. Testing /health Error Sanitization ---", flush=True)
        mock_db = AsyncMock()
        mock_db.command.side_effect = Exception("ConnectionRefusedError: connection to 10.0.0.123:27017 failed; credentials admin:SecretPassword123")
        from app.db.mongodb import get_database
        app.dependency_overrides[get_database] = lambda: mock_db
        try:
            health_err_res = client.get("/health")
            print(f"  Simulated DB Error /health -> Status {health_err_res.status_code}: {health_err_res.json()}", flush=True)
            assert health_err_res.status_code == 200
            data = health_err_res.json()
            assert data["status"] == "unhealthy"
            assert data["mongodb"] == "disconnected"
            assert "SecretPassword123" not in data["message"]
            assert "10.0.0.123" not in data["message"]
            assert data["message"] == "Database service unavailable."
            print("  Sanitized message verified: No internal credentials or IPs disclosed.", flush=True)
        finally:
            app.dependency_overrides.pop(get_database, None)

        # 4. TEST THAT NO API KEYS APPEAR IN LOGS
        print("\n--- 4. Testing API Key Exposure & Logging ---", flush=True)
        fake_api_key = "AIzaSyFakeKey1234567890abcdefghijklm"
        with patch("app.core.config.settings.GEMINI_API_KEY", fake_api_key):
            with patch("httpx.Client.post", side_effect=Exception("Simulated network failure on Gemini")):
                call_llm_json("Sample prompt", "Sample system prompt")
                generate_chat_reply("Hello assistant", [], {})

        logs_content = log_stream.getvalue()
        print(f"  Captured log lines count: {len(logs_content.splitlines())}", flush=True)
        assert fake_api_key not in logs_content, "SECURITY RISK: API key leaked in application logs!"
        print("  Confirmed: Fake API key does NOT appear in application logs!", flush=True)

    print("\n" + "=" * 70, flush=True)
    print("ALL P1 SECURITY CHECKS PASSED PERFECTLY!", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    run_p1_checks()
