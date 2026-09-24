import sys
import os
from fastapi.testclient import TestClient

# Add backend directory to sys.path
sys.path.insert(0, os.path.abspath('.'))

from app.main import app


def run_tests():
    print("=" * 60)
    print("RUNNING API INTEGRATION TESTS FOR RISKLENS BACKEND")
    print("=" * 60)

    # Use context manager so lifespan startup handler runs connect_to_mongo() & ml_loader
    with TestClient(app) as client:

        # 1. Health check
        res = client.get("/health")
        print(f"\n1. GET /health -> Status {res.status_code}:", res.json())
        assert res.status_code == 200
        assert res.json()["status"] == "healthy"

        # 2. Register user
        test_email = f"testuser_{os.urandom(3).hex()}@example.com"
        reg_payload = {
            "email": test_email,
            "password": "Password123!",
            "full_name": "Test Health User"
        }
        res = client.post("/auth/register", json=reg_payload)
        print(f"\n2. POST /auth/register -> Status {res.status_code}:", res.json())
        assert res.status_code == 201
        user_id = res.json()["id"]

        # 3. Login user
        res = client.post("/auth/login", json={"email": test_email, "password": "Password123!"})
        print(f"\n3. POST /auth/login -> Status {res.status_code}:", res.json())
        assert res.status_code == 200
        token = res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 4. Predict with COMPLETE payload for BOTH models
        full_payload = {
            # Diabetes fields (16)
            "Sex": 1,
            "Age": 45,  # Raw age 45 -> bucket code 6
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
            # Heart Disease fields (7 raw)
            "age": 45,
            "sex": 1,
            "cp": 2,  # Chest pain type 2 -> cp_2=1, rest=0
            "trestbps": 130,
            "chol": 240,
            "fbs": 0,
            "exang": 0
        }
        res = client.post("/predict", json=full_payload, headers=headers)
        print(f"\n4. POST /predict (Full Payload) -> Status {res.status_code}:")
        pred_data = res.json()
        print("  Diabetes result status:", pred_data["diabetes"]["status"])
        print("  Diabetes risk:", pred_data["diabetes"]["risk"])
        print("  Diabetes SHAP sample (3 features):", dict(list(pred_data["diabetes"]["shapValues"].items())[:3]))
        print("  Heart Disease result status:", pred_data["heartDisease"]["status"])
        print("  Heart Disease risk:", pred_data["heartDisease"]["risk"])
        print("  Heart Disease SHAP sample (3 features):", dict(list(pred_data["heartDisease"]["shapValues"].items())[:3]))
        assert res.status_code == 200
        assert pred_data["diabetes"]["status"] == "success"
        assert pred_data["heartDisease"]["status"] == "success"

        # 5. Predict with Partial payload (Missing Diabetes fields, Heart Disease complete)
        partial_payload_heart_only = {
            "age": 55,
            "sex": 0,
            "cp": 1,
            "trestbps": 140,
            "chol": 260,
            "fbs": 1,
            "exang": 1
        }
        res = client.post("/predict", json=partial_payload_heart_only, headers=headers)
        print(f"\n5. POST /predict (Heart Only) -> Status {res.status_code}:")
        pred_data_heart_only = res.json()
        print("  Diabetes status:", pred_data_heart_only["diabetes"]["status"], "Missing:", pred_data_heart_only["diabetes"]["missingFields"][:4])
        print("  Heart Disease status:", pred_data_heart_only["heartDisease"]["status"], "Risk:", pred_data_heart_only["heartDisease"]["risk"])
        assert pred_data_heart_only["diabetes"]["status"] == "insufficient_data"
        assert pred_data_heart_only["heartDisease"]["status"] == "success"

        # 6. GET /history
        res = client.get("/history", headers=headers)
        print(f"\n6. GET /history -> Status {res.status_code}: Total records = {len(res.json())}")
        history_records = res.json()
        assert res.status_code == 200
        assert len(history_records) >= 2

        print("\n" + "=" * 60)
        print("ALL API INTEGRATION TESTS PASSED SUCCESSFULLY!")
        print("=" * 60)


if __name__ == "__main__":
    run_tests()
