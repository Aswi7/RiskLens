# RiskLens — Multi-Disease Early Prediction & Health Platform

RiskLens is an intelligent, multi-model preventive health screening platform that provides dual-disease risk estimation (Type 2 Diabetes via XGBoost and Heart Disease via Logistic Regression), feature-level SHAP explainability, transparent wellness scores, personalized clinical action plans, RAG-grounded conversational health guidance, and nearby specialist location.

---

## Architecture Overview

```text
RISKLENS/
├── frontend/             # React 19, Tailwind CSS v4, Lucide Icons, Recharts, Vite
├── backend/              # FastAPI, Pydantic v2, Motor (Async MongoDB), PyMuPDF, Tesseract OCR
│   ├── app/
│   │   ├── core/         # Settings, JWT security, and configuration
│   │   ├── db/           # Async MongoDB connection management
│   │   ├── ml/           # ML Loader, preprocessing, inference & SHAP explainability service
│   │   ├── rag/          # Vector retrieval and clinical guideline embeddings
│   │   └── features/     # Feature-based modular routers (auth, predictions, llm, hospitals, labs, health)
│   ├── Dockerfile        # Production container specification (Python 3.11-slim + OCR)
│   └── requirements.txt  # Pinned ML dependencies (scikit-learn, xgboost, shap, joblib, numpy)
├── ml_models/            # Trained models, scalers, and dynamic meta.json configs
│   └── trained_models/   # diabetes_model.joblib, heart_model.joblib, scalers & metadata
├── docker-compose.yml    # Multi-container orchestration (MongoDB, Backend, Frontend)
└── README.md
```

---

## Hosting Tier & Hardware Requirements

> [!IMPORTANT]
> **Hosting Memory Sizing:**
> - Cold-start initialization of scikit-learn, XGBoost, SHAP, PyTorch, and tokenizers requires **~580 MB RSS RAM**.
> - Therefore, RiskLens **does NOT fit on 512 MB free hosting tiers** (e.g. Render 512MB free or Fly.io 512MB) and will trigger an Out-of-Memory (SIGKILL 137).
> - **Recommended Minimum Tier:** 1 GB to 2 GB RAM (e.g. Railway Standard, Render Starter/Standard, DigitalOcean 1GB+ Droplet, AWS t3.small, or GCP e2-medium).

---

## Environment Variables

### Host Required Environment Variables (Backend)

| Variable | Description | Required? | Production Default / Note |
|---|---|:---:|---|
| `DEBUG` | Enables developer mode and `/docs` | Yes | Set to `false` in production. |
| `JWT_SECRET` | Secret key for signing authentication tokens | **Required** | Must be a random string of **at least 32 characters** when `DEBUG=false`. |
| `ALLOWED_ORIGINS` | Comma-separated list of allowed frontend origins | **Required** | E.g. `https://your-frontend.domain.com` |
| `MONGODB_URI` | MongoDB connection URI string | **Required** | E.g. `mongodb+srv://user:pass@cluster.mongodb.net/risklens_db` |
| `MONGO_DB_NAME` | Database name | Optional | Defaults to `risklens_db`. |
| `PORT` | Backend listening port | Optional | Defaults to `8000`. |
| `HOST` | Backend listening host address | Optional | Defaults to `0.0.0.0`. |
| `GEMINI_API_KEY` | Google Gemini API key for Chat & Recommendations | Recommended | Fallbacks to rule-based clinical engine if omitted. |
| `GOOGLE_PLACES_API_KEY`| Google Maps / Places API key for Hospital Finder | Optional | Fallbacks to built-in location-aware specialist mock if omitted. |
| `MODEL_DIR` | Filesystem path to trained ML artifacts | Optional | Auto-resolved to `ml_models/trained_models` if empty. |

### Host Required Environment Variables (Frontend)

| Variable | Description | Required? | Production Note |
|---|---|:---:|---|
| `VITE_API_URL` | Base URL of the deployed FastAPI backend | **Required at build time** | E.g. `https://api.yourdomain.com` (no trailing slash). |
| `VITE_GOOGLE_CLIENT_ID`| Optional Google OAuth Client ID | Optional | Required only if enabling Google 1-tap sign-in. |

---

## Local Development Setup

### 1. Backend Setup

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# macOS / Linux
source venv/bin/activate

pip install -r requirements.txt

# Create .env from template
cp .env.example .env

# Run FastAPI development server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- API Documentation: `http://localhost:8000/docs` (available when `DEBUG=true`)
- Health Check: `http://localhost:8000/health`
- Readiness Probe: `http://localhost:8000/ready`

### 2. Frontend Setup

```bash
cd frontend
npm install

# Create .env from template
cp .env.example .env

# Start Vite dev server
npm run dev
```

- Local Web App: `http://localhost:5173`

---

## Production Deployment

### Option A: Docker Compose (All-in-One)

```bash
# 1. Clone repository
git clone https://github.com/Aswi7/RiskLens.git
cd RiskLens

# 2. Configure environment
export JWT_SECRET="your_very_long_secure_jwt_secret_key_at_least_32_chars"
export GEMINI_API_KEY="your_gemini_api_key"

# 3. Build and launch services
docker-compose up --build -d
```

### Option B: Cloud Hosting (Render, Railway, Fly.io, DigitalOcean)

1. **Deploy MongoDB:**
   - Use MongoDB Atlas (M0 Free or M10 Dedicated) or a managed database service.
   - Copy connection string to `MONGODB_URI`.
2. **Deploy Backend (Web Service):**
   - Base image: `backend/Dockerfile`
   - Memory allocation: **Minimum 1 GB RAM**.
   - Health check path: `/ready`
   - Set environment variables (`DEBUG=false`, `JWT_SECRET`, `ALLOWED_ORIGINS`, `MONGODB_URI`, `GEMINI_API_KEY`).
3. **Deploy Frontend (Static Site / CDN):**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Build environment variable: `VITE_API_URL=https://your-backend.up.railway.app`

---

## Testing

```bash
# Run End-to-End API Test Suite (pytest)
pytest backend/test_e2e_full.py -v

# Run Adversarial Chat & Safety Suite
python backend/test_adversarial_chat.py

# Run Playwright Browser Automation Suite
python backend/test_ui_playwright.py
```
