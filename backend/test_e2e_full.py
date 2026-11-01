import pytest
import httpx
import os
import io
from datetime import datetime, timezone, timedelta
from jose import jwt
from PIL import Image
import fitz  # PyMuPDF

BASE_URL = "http://127.0.0.1:8000"
JWT_SECRET = os.getenv("JWT_SECRET", "super-secret-jwt-key-minimum-32-chars-long!")
ALGORITHM = "HS256"


@pytest.fixture(scope="session", autouse=True)
def warmup_server():
    with httpx.Client(base_url=BASE_URL, timeout=30) as client:
        try:
            client.get("/health")
        except Exception:
            pass


def register_and_login(client: httpx.Client, email_prefix: str = "user"):

    ts = int(datetime.now().timestamp() * 1000)
    email = f"{email_prefix}_{ts}@test.com"
    pwd = "SecurePassword123!"
    
    # 1. Register
    reg_resp = client.post("/auth/register", json={
        "email": email,
        "password": pwd,
        "full_name": f"{email_prefix.capitalize()} Tester"
    })
    assert reg_resp.status_code == 201, f"Registration failed: {reg_resp.text}"
    user_data = reg_resp.json()
    
    # 2. Login
    login_resp = client.post("/auth/login", json={
        "email": email,
        "password": pwd
    })
    assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
    token_data = login_resp.json()
    token = token_data["access_token"]
    
    return token, user_data, email, pwd


# ==============================================================================
# ITEM 1: AUTH (Register, Login, Wrong Password, Expired Token, Logout)
# ==============================================================================
class TestAuthSuite:
    def test_1_register_user(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            ts = int(datetime.now().timestamp() * 1000)
            email = f"auth_test_{ts}@example.com"
            resp = client.post("/auth/register", json={
                "email": email,
                "password": "SecurePassword123!",
                "full_name": "Auth Tester"
            })
            assert resp.status_code == 201, f"Register failed: {resp.text}"
            data = resp.json()
            assert "id" in data
            assert data["email"] == email
            assert data["full_name"] == "Auth Tester"

    def test_2_login_success(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            ts = int(datetime.now().timestamp() * 1000)
            email = f"login_test_{ts}@example.com"
            client.post("/auth/register", json={"email": email, "password": "Password123!", "full_name": "Login User"})
            
            resp = client.post("/auth/login", json={"email": email, "password": "Password123!"})
            assert resp.status_code == 200, f"Login failed: {resp.text}"
            data = resp.json()
            assert "access_token" in data
            assert data["token_type"] == "bearer"

    def test_3_login_wrong_password(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            ts = int(datetime.now().timestamp() * 1000)
            email = f"wrong_pwd_{ts}@example.com"
            client.post("/auth/register", json={"email": email, "password": "Password123!", "full_name": "Wrong Pwd User"})
            
            resp = client.post("/auth/login", json={"email": email, "password": "WRONG_PASSWORD_999"})
            assert resp.status_code == 401, f"Expected 401 for wrong password, got {resp.status_code}"

    def test_4_expired_token_rejection(self):
        # Construct an expired token (past timestamp)
        past_time = datetime.now(timezone.utc) - timedelta(hours=2)
        expired_payload = {
            "sub": "some_user_id",
            "email": "expired@example.com",
            "exp": past_time
        }
        expired_token = jwt.encode(expired_payload, JWT_SECRET, algorithm=ALGORITHM)

        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            resp = client.get("/auth/me", headers={"Authorization": f"Bearer {expired_token}"})
            assert resp.status_code == 401, f"Expected 401 for expired token, got {resp.status_code}"

    def test_5_logout_and_unauthorized_access(self):
        # Stateless JWT logout: client clears token; endpoints without token reject with 401
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "logout_user")
            
            # Authenticated access succeeds
            me_resp = client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
            assert me_resp.status_code == 200
            
            # When logged out (no Authorization header), access is refused
            unauth_resp = client.get("/auth/me")
            assert unauth_resp.status_code == 401


# ==============================================================================
# ITEM 2: MULTI-TENANT ISOLATION (Two users cannot see each other's data)
# ==============================================================================
class TestMultiTenantIsolation:
    def test_users_cannot_access_each_others_data(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token_a, user_a, _, _ = register_and_login(client, "tenant_a")
            token_b, user_b, _, _ = register_and_login(client, "tenant_b")

            # User A submits a private assessment
            pred_a = client.post(
                "/predict",
                headers={"Authorization": f"Bearer {token_a}"},
                json={
                    "age": 45, "Age": 45, "sex": 1, "Sex": 1, "cp": 1, "trestbps": 125, "chol": 210, "fbs": 0, "exang": 0,
                    "BMI": 24, "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
                    "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
                    "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 0
                }
            )
            assert pred_a.status_code == 200

            # User B checks history -> must be completely empty (0 records)
            hist_b = client.get("/history", headers={"Authorization": f"Bearer {token_b}"})
            assert hist_b.status_code == 200
            records_b = hist_b.json()
            assert len(records_b) == 0, f"User B saw User A's records: {records_b}"

            # User B checks health-score -> 404 (no assessments completed by User B)
            hs_b = client.get("/health-score", headers={"Authorization": f"Bearer {token_b}"})
            assert hs_b.status_code == 404, f"User B should get 404, got {hs_b.status_code}"

            # User A checks history -> User A has exactly 1 record
            hist_a = client.get("/history", headers={"Authorization": f"Bearer {token_a}"})
            assert hist_a.status_code == 200
            records_a = hist_a.json()
            assert len(records_a) == 1
            assert records_a[0]["user_id"] == user_a["id"]


# ==============================================================================
# ITEM 3: THREE PERSONAS ASSESSMENT
# ==============================================================================
class TestPersonasAssessment:
    def test_persona_1_young_healthy_low_risk(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "p1_young")
            payload = {
                "age": 25, "Age": 25, "sex": 0, "Sex": 0, "cp": 1, "trestbps": 110, "chol": 170, "fbs": 0, "exang": 0,
                "BMI": 21, "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
                "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 1, "MentHlth": 0, "PhysHlth": 0
            }
            resp = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json=payload)
            assert resp.status_code == 200
            data = resp.json()
            heart = data["heartDisease"]
            diabetes = data["diabetes"]

            assert heart["risk"]["isHighRisk"] is False
            assert heart["risk"]["probability"] < 0.10
            assert heart["confidenceTier"] == "standard"
            assert diabetes["risk"]["isHighRisk"] is False
            assert diabetes["risk"]["probability"] < 0.10

    def test_persona_2_high_risk_older_user(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "p2_older")
            payload = {
                "age": 65, "Age": 65, "sex": 1, "Sex": 1, "cp": 0, "trestbps": 160, "chol": 280, "fbs": 1, "exang": 1,
                "BMI": 36, "HighBP": 1, "HighChol": 1, "Smoker": 1, "PhysActivity": 0,
                "Fruits": 0, "Veggies": 0, "HvyAlcoholConsump": 0, "Stroke": 1,
                "HeartDiseaseorAttack": 1, "DiffWalk": 1, "GenHlth": 5, "MentHlth": 10, "PhysHlth": 20
            }
            resp = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json=payload)
            assert resp.status_code == 200
            data = resp.json()
            heart = data["heartDisease"]
            diabetes = data["diabetes"]

            assert heart["risk"]["isHighRisk"] is True
            assert heart["risk"]["probability"] > 0.85
            assert diabetes["risk"]["isHighRisk"] is True
            assert diabetes["risk"]["probability"] > 0.50

    def test_persona_3_skips_all_vitals_screening_tier(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "p3_novitals")
            # All clinical labs omitted
            payload = {
                "age": 45, "Age": 45, "sex": 1, "Sex": 1, "cp": 1, "exang": 0,
                "BMI": 27, "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
                "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 0
            }
            resp = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json=payload)
            assert resp.status_code == 200
            data = resp.json()
            heart = data["heartDisease"]

            assert heart["confidenceTier"] == "screening"
            assert set(heart["imputedFields"]) == {"trestbps", "chol", "fbs"}
            assert heart["risk"]["probability"] is not None


# ==============================================================================
# ITEM 4 & 5: RECOMMENDATIONS & CHATBOT PERSONALIZATION
# ==============================================================================
class TestPersonalizationAndChat:
    def test_recommendations_and_chatbot_personalized_flow(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "chat_user")
            
            # Submit assessment with hypertension and high cholesterol
            pred_resp = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json={
                "age": 58, "Age": 58, "sex": 1, "Sex": 1, "cp": 1, "trestbps": 155, "chol": 245, "fbs": 0, "exang": 0,
                "BMI": 31, "HighBP": 1, "HighChol": 1, "Smoker": 1, "PhysActivity": 0,
                "Fruits": 0, "Veggies": 0, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 3, "MentHlth": 0, "PhysHlth": 0
            })
            assert pred_resp.status_code == 200
            
            # Fetch recommendations
            rec_resp = client.post("/recommendations", headers={"Authorization": f"Bearer {token}"}, json={})
            assert rec_resp.status_code == 200
            rec_data = rec_resp.json()
            assert isinstance(rec_data, dict)
            
            # Chatbot question
            chat_resp = client.post(
                "/chat",
                headers={"Authorization": f"Bearer {token}"},
                json={"message": "What lifestyle changes can help lower my blood pressure and cholesterol?"}
            )
            assert chat_resp.status_code == 200
            reply = chat_resp.json().get("reply", "")
            assert len(reply) > 20


# ==============================================================================
# ITEM 6: HOSPITAL FINDER (Allowed Lat/Lng, Manual Query Fallback, No Results)
# ==============================================================================
class TestHospitalFinder:
    def test_allowed_location_lat_lng(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "hosp_user")
            resp = client.get(
                "/hospitals/nearby?lat=37.7749&lng=-122.4194&condition=both",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "hospitals" in data
            assert data["results_count"] > 0
            specialties = [h["specialty"].lower() for h in data["hospitals"]]
            assert any("endocrinologist" in s or "cardiologist" in s or "hospital" in s for s in specialties)

    def test_denied_location_manual_query_fallback(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "hosp_user2")
            resp = client.get(
                "/hospitals/nearby?location=Boston,%20MA&condition=diabetes",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "hospitals" in data
            assert data["results_count"] > 0

    def test_area_with_no_results_or_empty_location(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "hosp_user3")
            resp = client.get(
                "/hospitals/nearby?condition=general",
                headers={"Authorization": f"Bearer {token}"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "hospitals" in data


# ==============================================================================
# ITEM 7: LAB UPLOADS (Digital PDF, Scanned PDF, Photo, Wrong Type, Oversized)
# ==============================================================================
class TestLabUploads:
    def test_digital_pdf_upload(self):
        doc = fitz.open()
        page = doc.new_page()
        page.insert_text((50, 72), "CLINICAL LAB REPORT\nTotal Cholesterol: 210 mg/dL\nFasting Glucose: 105 mg/dL\nHbA1c: 5.8 %\nBlood Pressure: 120/80 mmHg\n")
        pdf_bytes = doc.tobytes()
        doc.close()

        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "lab_digital")
            files = {"file": ("digital_report.pdf", pdf_bytes, "application/pdf")}
            resp = client.post("/labs/upload", headers={"Authorization": f"Bearer {token}"}, files=files)
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("file_type") == "PDF"
            assert "total_cholesterol" in data.get("detected_markers", {})

    def test_scanned_pdf_upload(self):
        doc = fitz.open()
        page = doc.new_page()
        img = Image.new("RGB", (300, 200), color=(255, 255, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        page.insert_image(page.rect, stream=buf.getvalue())
        pdf_bytes = doc.tobytes()
        doc.close()

        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "lab_scanned")
            files = {"file": ("scanned_blank.pdf", pdf_bytes, "application/pdf")}
            resp = client.post("/labs/upload", headers={"Authorization": f"Bearer {token}"}, files=files)
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("file_type") == "PDF"

    def test_photo_upload_jpeg(self):
        img = Image.new("RGB", (200, 100), color=(240, 240, 240))
        buf = io.BytesIO()
        img.save(buf, format="JPEG")
        jpg_bytes = buf.getvalue()

        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "lab_photo")
            files = {"file": ("lab_photo.jpg", jpg_bytes, "image/jpeg")}
            resp = client.post("/labs/upload", headers={"Authorization": f"Bearer {token}"}, files=files)
            assert resp.status_code == 200
            data = resp.json()
            assert data.get("file_type") == "Image"

    def test_wrong_file_type_rejected(self):
        exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00"
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "lab_malware")
            files = {"file": ("malware.exe", exe_bytes, "application/octet-stream")}
            resp = client.post("/labs/upload", headers={"Authorization": f"Bearer {token}"}, files=files)
            assert resp.status_code == 400

    def test_oversized_file_rejected(self):
        large_bytes = b"0" * (11 * 1024 * 1024)
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "lab_oversize")
            files = {"file": ("huge_report.pdf", large_bytes, "application/pdf")}
            resp = client.post("/labs/upload", headers={"Authorization": f"Bearer {token}"}, files=files)
            assert resp.status_code == 400 or resp.status_code == 413


# ==============================================================================
# ITEM 8: SECOND ASSESSMENT PRODUCES TREND
# ==============================================================================
class TestAssessmentTrend:
    def test_consecutive_assessments_create_trajectory(self):
        with httpx.Client(base_url=BASE_URL, timeout=30) as client:
            token, _, _, _ = register_and_login(client, "trend_user")

            # Assessment 1: High risk baseline
            r1 = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json={
                "age": 52, "Age": 52, "sex": 1, "Sex": 1, "cp": 1, "trestbps": 150, "chol": 260, "fbs": 0, "exang": 1,
                "BMI": 33, "HighBP": 1, "HighChol": 1, "Smoker": 1, "PhysActivity": 0,
                "Fruits": 0, "Veggies": 0, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 4, "MentHlth": 0, "PhysHlth": 0
            })
            assert r1.status_code == 200

            # Assessment 2: Improved metrics
            r2 = client.post("/predict", headers={"Authorization": f"Bearer {token}"}, json={
                "age": 52, "Age": 52, "sex": 1, "Sex": 1, "cp": 1, "trestbps": 128, "chol": 205, "fbs": 0, "exang": 0,
                "BMI": 28, "HighBP": 0, "HighChol": 0, "Smoker": 0, "PhysActivity": 1,
                "Fruits": 1, "Veggies": 1, "HvyAlcoholConsump": 0, "Stroke": 0,
                "HeartDiseaseorAttack": 0, "DiffWalk": 0, "GenHlth": 2, "MentHlth": 0, "PhysHlth": 0
            })
            assert r2.status_code == 200

            # Query historical predictions
            hist = client.get("/history", headers={"Authorization": f"Bearer {token}"})
            assert hist.status_code == 200
            records = hist.json()
            assert len(records) >= 2, f"Expected at least 2 records for trend, got {len(records)}"

            # Verify risk reduction trend
            latest = records[0]["results"]
            previous = records[1]["results"]
            p_latest_heart = latest["heartDisease"]["risk"]["probability"]
            p_prev_heart = previous["heartDisease"]["risk"]["probability"]
            assert p_latest_heart < p_prev_heart, f"Expected risk improvement, but latest ({p_latest_heart}) >= previous ({p_prev_heart})"
