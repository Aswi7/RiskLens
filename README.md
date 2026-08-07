# RiskLens - Multi-Disease Early Prediction Health Platform

RiskLens is a multi-disease early prediction health platform leveraging machine learning and LLMs. The platform predicts risks for various health conditions, offers patient-specific insights via natural language, and locates nearby healthcare facilities.

## Project Structure

This is a monorepo setup containing the frontend, backend, and machine learning components:

```text
RISKLENS/
├── docs/                 # Architecture notes & developers guides
├── frontend/             # React (Vite) + Tailwind CSS + Recharts + React Query Client
├── backend/              # FastAPI + MongoDB (Async motor) Server (Feature-based structure)
└── ml_models/            # XGBoost + SHAP model training/inference scripts
```

## Environment Configuration

Both frontend and backend rely on configuration settings defined in `.env` files. 

1. **Frontend Setup**:
   Copy the example environment file inside `/frontend`:
   ```bash
   cp frontend/.env.example frontend/.env
   ```
   Set the API URL:
   ```env
   VITE_API_URL=http://localhost:8000
   ```

2. **Backend Setup**:
   Copy the example environment file inside `/backend`:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Fill in the required keys:
   ```env
   MONGODB_URI=mongodb://localhost:27017
   JWT_SECRET=your_jwt_secret_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   GOOGLE_PLACES_API_KEY=your_google_places_api_key_here
   ```

---

## Running Locally

### 1. Backend Server (FastAPI)

Ensure MongoDB is installed and running locally, or configure your external `MONGODB_URI`.

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

The backend API documentation will be available at `http://localhost:8000/docs`.

### 2. Frontend Client (React)

```bash
cd frontend
npm install
npm run dev
```

The application will run locally at `http://localhost:5173/`.

### 3. ML Models Workspace

```bash
cd ml_models
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
```
All model training scripts should be executed from `/ml_models/scripts/`.
