# RiskLens - Multi-Disease Early Prediction Health Platform

RiskLens is a multi-disease early prediction health platform leveraging machine learning and LLMs. The platform predicts risks for various health conditions, offers patient-specific insights via natural language, and locates nearby healthcare facilities.

## Project Structure

This is a monorepo setup containing the frontend, backend, and machine learning components:

```text
RISKLENS/
├── frontend/             # React (Vite) + Tailwind CSS + TypeScript Client
├── backend/              # FastAPI + MongoDB (Async motor) Server
├── ml_models/            # XGBoost + SHAP prediction pipelines
├── .gitignore            # Root git ignore configuration
└── README.md             # This guide
```

## Stack

- **Frontend**: React, Vite, TypeScript, Tailwind CSS
- **Backend**: FastAPI, MongoDB (Motor/Pydantic v2), Pydantic Settings
- **Machine Learning**: XGBoost, SHAP, Scikit-Learn
- **APIs**: Claude/GPT API for LLM functionality, Google Places API for hospital search

## Quick Start

### 1. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Create a `frontend/.env` file based on `frontend/.env.example`.

### 2. Backend Setup

```bash
cd backend
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload
```

Create a `backend/.env` file based on `backend/.env.example`.

### 3. ML Models Setup

```bash
cd ml_models
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```

Create a `ml_models/.env` file based on `ml_models/.env.example` if paths or data fetch endpoints are configured.
