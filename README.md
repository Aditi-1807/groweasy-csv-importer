# GrowEasy AI-Powered CSV Importer

## Candidate Submission Details
- **Candidate Name**: Lakshya Jain
- **Email**: lakshyajain2408@gmail.com
- **Position Applied For**: Software Developer Intern
- **GitHub Repository**: *[To be added after git push]*
- **Hosted Application URL**: *[To be added after deployment]*

---

An intelligent CSV importer system designed to map any uploaded lead sheet layout into the standardized GrowEasy CRM format using AI mapping.

## Features

- **Upload & Parse (Step 1 & 2)**: Drag-and-drop CSV upload with high-accuracy parsing supporting different separators, Byte Order Marks (BOM), and trailing/leading spaces. Provides a responsive data preview table.
- **Progressive Batch Processing (Step 3)**: Process leads in configurable chunks to avoid rate limiting and allow real-time progress indicators (count and percentage updates).
- **Retry Mechanism**: Ability to retry failed batches selectively.
- **Results View (Step 4)**: Overview dashboard showing success and skipped statistics, along with a results table featuring custom pagination, status tags, search queries, and options to filter leads (All / Successfully Mapped / Skipped).
- **Sanitized Export**: Options to download the mapped output in standardized CSV or JSON formats.
- **Sleek UX**: Premium styling with fluid animations,Outfit/Jakarta Sans typography, CSS variables, glassmorphic styling, and full Dark Mode support.
- **State-of-the-Art Dual Engine**:
  - **AI Mode**: Integrates the Gemini API (using `@google/generative-ai` with schema constraints) to guarantee structured outputs matching GrowEasy's exact CRM layout.
  - **Heuristic Fallback Mode**: If no Gemini API key is supplied, a smart fallback heuristics engine analyzes column patterns and field tokens (using regexes) to automatically parse and map the data with high accuracy. This allows immediate testing out of the box!

---

## Directory Structure

```
groweasy-csv-importer/
├── backend/
│   ├── utils/
│   │   ├── csvParser.js        # CSV Buffer parser (csv-parser)
│   │   └── aiExtractor.js      # Gemini client & heuristic mapping engine
│   ├── server.js               # Express API endpoints
│   ├── test.js                 # Local unit tests for heuristics
│   ├── .env.example            # Environment template
│   ├── .env                    # Actual environment config
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── public/
│   │   └── sample_leads.csv    # Ready-to-use template for testing
│   ├── src/
│   │   └── app/
│   │       ├── layout.tsx      # Document layout & SEO meta tags
│   │       ├── page.tsx        # Multi-step importer page
│   │       └── globals.css     # Design system, themes & animations
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml          # Container configuration
└── README.md                   # Main documentation
```

---

## Getting Started

### Prerequisites
Make sure you have Node.js (v18+) and npm installed on your system.

---

### Option A: Run as a Single Monolithic Server (Recommended & Production-ready)
You can compile the frontend and host both the API and UI from a single Node/Express server on **`http://localhost:5000`**. This is the easiest way to run the full application and requires zero configuration.

#### 1. Compile the Frontend Static Bundle:
Navigate to the `frontend/` directory, install dependencies, and build:
```bash
cd frontend
npm install
npm run build
```
*This compiles the Next.js pages statically into `frontend/out`.*

#### 2. Start the Unified Express Server:
Navigate to the `backend/` directory, install dependencies, configure your environment, and start:
```bash
cd ../backend
npm install
```
Copy `.env.example` to `.env` and set your `GEMINI_API_KEY`:
```bash
cp .env.example .env
```
Run the server:
```bash
npm start
```
Open **`http://localhost:5000`** in your browser. The Express server serves the user interface and coordinates the AI endpoints on the same port!

---

### Option B: Run in Independent Development Mode (Hot-Reloading)
For active coding and hot-reloading on both frontend and backend:

#### 1. Start the Backend API:
```bash
cd backend
npm install
cp .env.example .env  # Configure GEMINI_API_KEY
npm run dev           # Runs hot-reloading server on port 5000
```

#### 2. Start the Frontend Dev Server:
```bash
cd frontend
npm install
npm run dev           # Runs Next.js hot-reloading dev server on port 3000
```
Open **`http://localhost:3000`** in your browser. The frontend automatically detects port 3000 and forwards API calls to `http://localhost:5000` under the hood.

---

### Run Backend Unit Tests
Verify the parser mapping rules locally:
```bash
cd backend
npm test
```

### Option B: Docker Compose Setup

Run both services inside isolated containers:

1. Navigate to the root directory.
2. Build and start the containers:
   ```bash
   docker-compose up --build
   ```
3. Access the frontend app at `http://localhost:3000` and the API at `http://localhost:5000`.

---

## AI Mapping & Heuristics Rules

The importer maps input columns to the following GrowEasy CRM fields:
- `created_at` (JavaScript-convertible timestamp)
- `name` (Lead name)
- `email` (Primary email address)
- `country_code` (Parsed country dial prefix)
- `mobile_without_country_code` (Cleaned mobile number digits)
- `company` (Company name)
- `city`, `state`, `country` (Location info)
- `lead_owner` (Lead owner)
- `crm_status` (Status: `GOOD_LEAD_FOLLOW_UP`, `DID_NOT_CONNECT`, `BAD_LEAD`, `SALE_DONE`)
- `crm_note` (Follow-up notes, alternative contact numbers, or secondary email addresses)
- `data_source` (Source matching standard lists like `leads_on_demand`, `meridian_tower`, etc.)
- `possession_time` (Property possession timeframe)
- `description` (Additional details)

### Skipping Invalid Records
If a row contains **neither an email address nor a phone number**, it is flagged as `skipped` with the reason `"Record lacks both email and mobile number"` and is excluded from the CRM import total.

### Multiple Contact Information
- If multiple email addresses are detected, the first is extracted as the primary email; secondary addresses are appended to the `crm_note`.
- If multiple phone numbers are detected, the first is separated into `country_code` / `mobile_without_country_code`, and remaining numbers are appended to the `crm_note`.
