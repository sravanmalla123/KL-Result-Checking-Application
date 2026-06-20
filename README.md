# VeriReport — AI Document Authenticator & Grader

VeriReport is a modern academic report authenticator, plagiarism grader, and document validator. It evaluates student reports by parsing layouts, scanning text vocabulary densities, and performing visual heuristics using custom ML models or cloud-based LLM vision engines (Gemini, ChatGPT, Claude, Blackbox).

---

## Key Features

- **Strict Image Violation Enforcement**: Automatically grades the report as `0` marks (FAIL) if any AI-generated image (synthetic texture, airbrushed highlight, high color entropy/saturation), edited/photoshop manipulated visual, or household photo (family snapshot, selfie, pet) is found.
- **Double-Guardrail Overrides**: Scans both report text for explicit generative AI/household photo statements and applies unique color-count filters to flag AI-generated diagrams.
- **Academic Score Logic**: Grades authentic reports out of 100 marks based on structural compliance and domain relevance, utilizing a 55–59 grace pass band (rounded to 60 PASS).
- **Multi-Engine Comparisons**: Runs evaluations side-by-side across all supported APIs with comparative charts and overall status consensus checks.
- **Audible Commentary**: Generates TTS readings of assessments and lets examiners record voice comments stored in history.

---

## Quick Start (One-Click Setup on Windows)

If you are running the project on Windows for the first time:

1. Clone this repository.
2. Double-click the **`setup_and_start.bat`** script in the project root directory.

This script will automatically:
- Install the required Node modules (`npm install`).
- Create a Python virtual environment (`venv`).
- Install backend dependencies (`fastapi`, `uvicorn`, `scikit-learn`, `numpy`, `scipy`, `pillow`, etc.).
- Launch both the FastAPI backend (`port 8000`) and the Vite dev server (`port 5173`) in separate command prompt windows.

---

## Manual Setup

### 1. Prerequisites
- **Node.js** (v18 or higher)
- **Python 3.10+** (with pip)

### 2. Frontend Installation
Open a terminal in the project root and run:
```bash
npm install
```

### 3. Backend Installation
Create and activate a virtual environment, then install Python requirements:
```bash
# Create virtual environment
python -m venv venv

# Activate on Windows
venv\Scripts\activate

# Install requirements
pip install -r backend/requirements.txt
```

### 4. Running the Servers
Start both servers in parallel:

**Start backend FastAPI server:**
```bash
# Run in virtual environment
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Start frontend Vite dev server:**
```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Testing Scenarios

We have prepared automated test scripts to verify the core grading mechanics:

- **Scenario Tests**:
  ```bash
  venv\Scripts\python test_scenarios.py
  ```
- **Grace Band Tests**:
  ```bash
  venv\Scripts\python test_grace.py
  ```
- **ML Analyzer Tests**:
  ```bash
  venv\Scripts\python backend/test_ml.py
  ```
