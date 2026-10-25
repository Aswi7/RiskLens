import sys
import os
from datetime import timedelta
from fastapi.testclient import TestClient

# Add backend to path
sys.path.insert(0, os.path.abspath('.'))

from app.main import app
from app.core.security import create_access_token


def run_p0_checks():
    print("=" * 70)
    print("RUNNING P0 SECURITY VERIFICATION CHECKS")
    print("=" * 70)

    with TestClient(app) as client:
        endpoints = [
            ("POST", "/predict", {"Sex": 1, "Age": 45, "BMI": 25.0}),
            ("GET", "/history", None),
            ("POST", "/recommendations", {}),
            ("POST", "/chat", {"message": "Hello"}),
            ("GET", "/hospitals/nearby?lat=37.77&lng=-122.41", None)
        ]

        # 1. TEST NO TOKEN -> 401 on all 5 endpoints
        print("\n--- 1. Testing NO TOKEN on all 5 endpoints ---")
        for method, path, body in endpoints:
            if method == "POST":
                res = client.post(path, json=body)
            else:
                res = client.get(path)
            print(f"  {method} {path} -> Status {res.status_code}")
            assert res.status_code == 401, f"Expected 401 for {method} {path}, got {res.status_code}"

        # 2. TEST BAD TOKEN -> 401 on all 5 endpoints
        print("\n--- 2. Testing BAD TOKEN on all 5 endpoints ---")
        bad_headers = {"Authorization": "Bearer this_is_an_invalid_malformed_token"}
        for method, path, body in endpoints:
            if method == "POST":
                res = client.post(path, json=body, headers=bad_headers)
            else:
                res = client.get(path, headers=bad_headers)
            print(f"  {method} {path} -> Status {res.status_code}")
            assert res.status_code == 401, f"Expected 401 for bad token on {method} {path}, got {res.status_code}"

        # 3. TEST EXPIRED TOKEN -> 401 on all 5 endpoints
        print("\n--- 3. Testing EXPIRED TOKEN on all 5 endpoints ---")
        expired_token = create_access_token(
            data={"sub": "any_user_id", "email": "test@expired.com"},
            expires_delta=timedelta(seconds=-60)  # expired 60 seconds ago
        )
        expired_headers = {"Authorization": f"Bearer {expired_token}"}
        for method, path, body in endpoints:
            if method == "POST":
                res = client.post(path, json=body, headers=expired_headers)
            else:
                res = client.get(path, headers=expired_headers)
            print(f"  {method} {path} -> Status {res.status_code}")
            assert res.status_code == 401, f"Expected 401 for expired token on {method} {path}, got {res.status_code}"

        # 4. TEST USER ISOLATION & HISTORY ACCESS CONTROL
        print("\n--- 4. Testing User 1 & User 2 Isolation ---")
        rand_suffix = os.urandom(3).hex()
        user1_email = f"user1_{rand_suffix}@example.com"
        user2_email = f"user2_{rand_suffix}@example.com"

        # Register and Login User 1
        res1 = client.post("/auth/register", json={"email": user1_email, "password": "Password123!", "full_name": "User One"})
        assert res1.status_code == 201
        u1_id = res1.json()["id"]

        login1 = client.post("/auth/login", json={"email": user1_email, "password": "Password123!"})
        assert login1.status_code == 200
        token1 = login1.json()["access_token"]
        headers1 = {"Authorization": f"Bearer {token1}"}

        # Verify /auth/me for User 1
        me1 = client.get("/auth/me", headers=headers1)
        assert me1.status_code == 200
        assert me1.json()["email"] == user1_email
        print(f"  User 1 registered & logged in: {user1_email} (ID: {u1_id})")

        # Register and Login User 2
        res2 = client.post("/auth/register", json={"email": user2_email, "password": "Password123!", "full_name": "User Two"})
        assert res2.status_code == 201
        u2_id = res2.json()["id"]

        login2 = client.post("/auth/login", json={"email": user2_email, "password": "Password123!"})
        assert login2.status_code == 200
        token2 = login2.json()["access_token"]
        headers2 = {"Authorization": f"Bearer {token2}"}

        # Verify /auth/me for User 2
        me2 = client.get("/auth/me", headers=headers2)
        assert me2.status_code == 200
        assert me2.json()["email"] == user2_email
        print(f"  User 2 registered & logged in: {user2_email} (ID: {u2_id})")

        # User 1 submits a prediction
        test_payload = {
            "Sex": 1, "Age": 45, "BMI": 28.0,
            "HighBP": 1, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
            "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
            "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 2,
            "age": 45, "sex": 1, "cp": 1, "trestbps": 125, "chol": 210, "fbs": 0, "exang": 0
        }
        pred_res = client.post("/predict", json=test_payload, headers=headers1)
        assert pred_res.status_code == 200
        print("  User 1 submitted a prediction record.")

        # Check User 1 history -> has 1 record
        h1 = client.get("/history", headers=headers1)
        assert h1.status_code == 200
        records1 = h1.json()
        assert len(records1) >= 1
        assert all(r["user_id"] == u1_id for r in records1)
        print(f"  User 1 history count: {len(records1)} (all belong to User 1)")

        # Check User 2 history -> MUST BE EMPTY (User 2 cannot see User 1's history!)
        h2 = client.get("/history", headers=headers2)
        assert h2.status_code == 200
        records2 = h2.json()
        assert len(records2) == 0, f"Cross-tenant leak! User 2 can see records: {records2}"
        print(f"  User 2 history count: {len(records2)} (Isolated! User 2 cannot see User 1's data)")

        # 5. TEST EXPLICIT DEMO LOGIN ROUTE
        print("\n--- 5. Testing Explicit /auth/demo-login Route ---")
        demo_res = client.post("/auth/demo-login")
        assert demo_res.status_code == 200
        demo_token = demo_res.json()["access_token"]
        demo_headers = {"Authorization": f"Bearer {demo_token}"}
        demo_me = client.get("/auth/me", headers=demo_headers)
        assert demo_me.status_code == 200
        assert demo_me.json()["email"] == "demo@risklens.com"
        print(f"  /auth/demo-login successfully issued token for: {demo_me.json()['email']}")

        # Demo user can access protected routes
        demo_hosp = client.get("/hospitals/nearby?lat=37.77&lng=-122.41", headers=demo_headers)
        assert demo_hosp.status_code == 200
        print(f"  Demo user accessed /hospitals/nearby: status {demo_hosp.status_code}")

    print("\n" + "=" * 70)
    print("ALL P0 SECURITY CHECKS PASSED PERFECTLY!")
    print("=" * 70)


if __name__ == "__main__":
    run_p0_checks()
