import sys
import os
from fastapi.testclient import TestClient

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import app
from app.db.mongodb import get_database

def test_vite_key_removed():
    print("\n--- Check 1: Verify VITE_GOOGLE_PLACES_API_KEY removed from frontend/.env.example ---")
    frontend_env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend", ".env.example")
    with open(frontend_env_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert "VITE_GOOGLE_PLACES_API_KEY" not in content, "VITE_GOOGLE_PLACES_API_KEY still found in frontend/.env.example!"
    print("PASS: VITE_GOOGLE_PLACES_API_KEY is not present in frontend/.env.example.")


def test_history_pagination_and_global_500():
    print("\n--- Check 2: History Pagination (limit & skip) & Check 3: Global Safe 500 Handler ---")
    
    # Add a route to app that raises an unhandled exception to test global handler
    @app.get("/test-unhandled-exception")
    async def crash_endpoint():
        raise RuntimeError("Sensitive internal database connection string: postgres://admin:secretpass@10.0.0.1")

    with TestClient(app, raise_server_exceptions=False) as client:
        # Test Global 500 Exception Handler
        res_500 = client.get("/test-unhandled-exception")
        print(f"Unhandled Exception Status Code: {res_500.status_code}")
        print(f"Unhandled Exception Response: {res_500.text}")
        assert res_500.status_code == 500, f"Expected 500, got {res_500.status_code}"
        data_500 = res_500.json()
        assert data_500["error_type"] == "InternalServerError"
        assert "An internal server error occurred" in data_500["detail"]
        assert "secretpass" not in res_500.text, "Sensitive internal details leaked in 500 response!"
        print("PASS: Global exception handler caught unhandled exception and returned safe JSON.")

        # Register a unique user for pagination test
        user_email = "p3_test_user@example.com"
        client.post("/auth/register", json={
            "email": user_email,
            "password": "Password123!",
            "full_name": "P3 Test User"
        })
        login_res = client.post("/auth/login", json={
            "email": user_email,
            "password": "Password123!"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        token = login_res.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}

        # Generate 5 prediction records via the API
        base_payload = {
            "Sex": 1,
            "Age": 45,
            "BMI": 28.5,
            "HighBP": 1,
            "HighChol": 0,
            "Smoker": 0,
            "PhysActivity": 1,
            "Fruits": 1,
            "Veggies": 1,
            "HvyAlcoholConsump": 0,
            "Stroke": 0,
            "HeartDiseaseorAttack": 0,
            "DiffWalk": 0,
            "GenHlth": 2,
            "MentHlth": 0,
            "PhysHlth": 2,
            "age": 45,
            "sex": 1,
            "cp": 2,
            "trestbps": 130,
            "chol": 240,
            "fbs": 0,
            "exang": 0
        }
        for i in range(5):
            payload = dict(base_payload)
            payload["Age"] = 40 + i
            payload["age"] = 40 + i
            p_res = client.post("/predict", json=payload, headers=headers)
            assert p_res.status_code == 200, f"Predict failed: {p_res.text}"

        # Test limit=2, skip=0 (expect 2 records: most recent items i=4, i=3)
        res_page1 = client.get("/history?limit=2&skip=0", headers=headers)
        assert res_page1.status_code == 200, f"Expected 200, got {res_page1.status_code}"
        items_page1 = res_page1.json()
        assert len(items_page1) == 2, f"Expected 2 items, got {len(items_page1)}"
        print(f"Page 1 (limit=2, skip=0): received {len(items_page1)} items. Timestamps: {[x['timestamp'] for x in items_page1]}")

        # Test limit=2, skip=2 (expect 2 records: items i=2, i=1)
        res_page2 = client.get("/history?limit=2&skip=2", headers=headers)
        assert res_page2.status_code == 200
        items_page2 = res_page2.json()
        assert len(items_page2) == 2
        print(f"Page 2 (limit=2, skip=2): received {len(items_page2)} items. Timestamps: {[x['timestamp'] for x in items_page2]}")

        # Verify no overlap between page 1 and page 2
        p1_ids = {x["id"] for x in items_page1}
        p2_ids = {x["id"] for x in items_page2}
        assert p1_ids.isdisjoint(p2_ids), "Page 1 and Page 2 contain overlapping record IDs!"

        # Test limit=2, skip=4 (expect 1 record: item i=0)
        res_page3 = client.get("/history?limit=2&skip=4", headers=headers)
        assert res_page3.status_code == 200
        items_page3 = res_page3.json()
        assert len(items_page3) == 1, f"Expected 1 item, got {len(items_page3)}"
        print(f"Page 3 (limit=2, skip=4): received {len(items_page3)} items. Timestamps: {[x['timestamp'] for x in items_page3]}")

        # Test validation on limit and skip boundaries
        res_invalid_limit = client.get("/history?limit=0", headers=headers)
        assert res_invalid_limit.status_code == 422, f"Expected 422 for limit=0, got {res_invalid_limit.status_code}"

        res_invalid_limit_max = client.get("/history?limit=101", headers=headers)
        assert res_invalid_limit_max.status_code == 422, f"Expected 422 for limit=101, got {res_invalid_limit_max.status_code}"

        res_invalid_skip = client.get("/history?skip=-1", headers=headers)
        assert res_invalid_skip.status_code == 422, f"Expected 422 for skip=-1, got {res_invalid_skip.status_code}"

        print("PASS: /history pagination with limit and skip and boundary validation passed completely.")


if __name__ == "__main__":
    test_vite_key_removed()
    test_history_pagination_and_global_500()
    print("\n==============================================")
    print("ALL P3 SECURITY CHECKS PASSED PERFECTLY!")
    print("==============================================")
