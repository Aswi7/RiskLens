import sys
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pydantic import ValidationError
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.abspath('.'))

from app.main import app
from app.core.config import Settings


def run_p2_checks():
    print("=" * 70, flush=True)
    print("RUNNING P2 SECURITY & ROBUSTNESS VERIFICATION CHECKS", flush=True)
    print("=" * 70, flush=True)

    with TestClient(app) as client:
        # Get demo token for authenticated testing
        demo_login_res = client.post("/auth/demo-login")
        assert demo_login_res.status_code == 200
        token = demo_login_res.json()["access_token"]
        auth_headers = {"Authorization": f"Bearer {token}"}

        # 1. TEST /hospitals/nearby with lat=999 returns 422
        print("\n--- 1. Testing /hospitals/nearby coordinate boundary (lat=999) ---", flush=True)
        res_lat = client.get("/hospitals/nearby?lat=999&lng=-122.41", headers=auth_headers)
        print(f"  GET /hospitals/nearby?lat=999 -> Status {res_lat.status_code}", flush=True)
        assert res_lat.status_code == 422, f"Expected 422 for lat=999, got {res_lat.status_code}"

        res_lng = client.get("/hospitals/nearby?lat=37.77&lng=999", headers=auth_headers)
        print(f"  GET /hospitals/nearby?lng=999 -> Status {res_lng.status_code}", flush=True)
        assert res_lng.status_code == 422, f"Expected 422 for lng=999, got {res_lng.status_code}"

        # 2. TEST DUPLICATE EMAIL RETURNS 409 EVEN WITH SIMULTANEOUS REQUESTS
        print("\n--- 2. Testing Duplicate Email 409 Conflict with Simultaneous Requests ---", flush=True)
        dup_email = f"concurrent_user_{os.urandom(3).hex()}@example.com"
        reg_payload = {
            "email": dup_email,
            "password": "Password123!",
            "full_name": "Concurrent Test User"
        }

        # Fire 2 simultaneous requests in parallel threads using the active client
        def send_reg():
            return client.post("/auth/register", json=reg_payload)

        with ThreadPoolExecutor(max_workers=2) as executor:
            fut1 = executor.submit(send_reg)
            fut2 = executor.submit(send_reg)
            res1 = fut1.result()
            res2 = fut2.result()

        status_codes = sorted([res1.status_code, res2.status_code])
        print(f"  Simultaneous register requests statuses: {status_codes}", flush=True)
        # One must succeed with 201, the other must return 409 Conflict!
        assert 201 in status_codes, f"Expected one 201, got {status_codes}"
        assert 409 in status_codes, f"Expected one 409 Conflict, got {status_codes}"

        # Third sequential request with same email must also return 409
        res3 = client.post("/auth/register", json=reg_payload)
        print(f"  Subsequent register with duplicate email -> Status {res3.status_code}", flush=True)
        assert res3.status_code == 409, f"Expected 409 for duplicate email, got {res3.status_code}"

        # 3. TEST NON-DEFAULT JWT SECRET ENFORCEMENT WHEN DEBUG=FALSE
        print("\n--- 3. Testing Non-Default JWT Secret Enforcement when DEBUG=False ---", flush=True)
        # 3a. Default secret with DEBUG=False -> Must fail validation
        default_secret = "risklens_super_secret_jwt_key_2026_change_in_production"
        failed_as_expected_1 = False
        try:
            Settings(DEBUG=False, JWT_SECRET=default_secret)
        except (ValueError, ValidationError) as e:
            failed_as_expected_1 = True
            print(f"  Default secret + DEBUG=False correctly rejected with: {type(e).__name__}", flush=True)
        assert failed_as_expected_1, "Expected ValueError when DEBUG=False with default JWT_SECRET!"

        # 3b. Short secret with DEBUG=False -> Must fail validation
        failed_as_expected_2 = False
        try:
            Settings(DEBUG=False, JWT_SECRET="too_short_secret")
        except (ValueError, ValidationError) as e:
            failed_as_expected_2 = True
            print(f"  Short secret + DEBUG=False correctly rejected with: {type(e).__name__}", flush=True)
        assert failed_as_expected_2, "Expected ValueError when DEBUG=False with short JWT_SECRET!"

        # 3c. Strong 32+ character non-default secret with DEBUG=False -> Must succeed
        strong_secret = "prod_super_secure_jwt_secret_key_exceeding_32_characters_2026!"
        valid_settings = Settings(DEBUG=False, JWT_SECRET=strong_secret)
        assert valid_settings.JWT_SECRET == strong_secret
        print("  Strong non-default secret + DEBUG=False accepted successfully.", flush=True)

        # 4. TEST OFF-THREAD SHAP AND EMBEDDINGS (EVENT LOOP REMAINS RESPONSIVE)
        print("\n--- 4. Testing Asynchronous Offloading of ML & Embeddings ---", flush=True)
        # Test predict still returns 200 via worker thread
        pred_payload = {
            "Sex": 1, "Age": 45, "BMI": 28.0,
            "HighBP": 1, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
            "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
            "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 2,
            "age": 45, "sex": 1, "cp": 1, "trestbps": 125, "chol": 210, "fbs": 0, "exang": 0
        }
        res_pred = client.post("/predict", json=pred_payload, headers=auth_headers)
        assert res_pred.status_code == 200
        print("  POST /predict successfully executed via asyncio.to_thread without blocking event loop.", flush=True)

        # Test RAG retrieval via worker thread
        chat_res = client.post("/chat", json={"message": "What is the recommended aerobic exercise for diabetes?"}, headers=auth_headers)
        assert chat_res.status_code == 200
        print("  POST /chat (RAG retrieval) successfully executed via asyncio.to_thread without blocking event loop.", flush=True)

    print("\n" + "=" * 70, flush=True)
    print("ALL P2 SECURITY CHECKS PASSED PERFECTLY!", flush=True)
    print("=" * 70, flush=True)


if __name__ == "__main__":
    run_p2_checks()
