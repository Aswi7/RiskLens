# Build Guide: Setting Up RiskLens

This document outlines the local workspace setup procedure for development.

## Prerequisites

- **Node.js**: v18+ (Vite 8 requires Node.js 18+ or 20+)
- **Python**: v3.10+ (for FastAPI and compatibility with XGBoost/SHAP)
- **MongoDB**: A running local or remote MongoDB instance

---

## 1. Backend Setup

The backend uses FastAPI and Motor (an asynchronous MongoDB driver).

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### Environment Configuration (`backend/.env`)
Create a `.env` file in `/backend` using the variables defined in `backend/.env.example`:
- `MONGODB_URI`: Connection string (e.g. `mongodb://localhost:27017/`)
- `JWT_SECRET`: Secret key for token signing (e.g. `risklens-super-secret-key-1234`)
- `ANTHROPIC_API_KEY`: Anthropic developer key
- `GOOGLE_PLACES_API_KEY`: Google Maps/Places API key

To launch the dev server:
```bash
uvicorn app.main:app --reload --port 8000
```

---

## 2. Frontend Setup

The frontend uses Vite, React (TypeScript), Tailwind CSS v4, Axios, and React Query.

```bash
cd frontend
npm install
```

### Environment Configuration (`frontend/.env`)
Create a `.env` file in `/frontend`:
- `VITE_API_URL`: The URL of your FastAPI backend (defaults to `http://localhost:8000`)

To launch the dev server:
```bash
npm run dev
```

---

## 3. ML Models Workspace

The ML modeling directory uses standard Python pip dependency management.

```bash
cd ml_models
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

Run training scripts directly from the `ml_models/scripts/` folder. Joblib models will be output to `ml_models/trained_models/` which is ignored by git.
