# Ai Interviewer Bot Backend

Express.js server for AI Interviewer, providing API endpoints for generating interview questions, scoring answers, and summarizing results using Google Gemini API.

## Features

 - Health Check: `GET /api/health` returns server status.
 - Generate Questions: `POST /api/gemini/generate-questions` accepts `{ resumeText }` and returns 6 AI-generated interview questions.
 - Score Answers: `POST /api/gemini/score-answer` accepts `{ question, answer, timeSpent }` and returns a score and feedback.
 - Generate Summary: `POST /api/gemini/generate-summary` accepts `{ answers }` and returns an overall score and summary.
 - Circuit Breaker Pattern: Resilient to API failures with configurable thresholds.
 - CORS Support: Configurable allowed origins.

## Prerequisites

 - Node.js (v14 or higher)
 - npm

## Installation

```bash
cd backend
npm install
```

## Environment Variables

Create a `.env` file in the `backend` directory with:

```
GEMINI_API_KEY=your_google_gemini_api_key
CORS_ALLOWED_ORIGINS=http://localhost:5173
PORT=5000
```

 - `GEMINI_API_KEY`: API key for Google Gemini.
 - `CORS_ALLOWED_ORIGINS` (optional): Comma-separated list of allowed origins for CORS.
 - `PORT` (optional): Port number (default: 5000).

## Running the Server

```bash
npm start
```

The server will start on `http://localhost:5000`.

## API Endpoints

 - `GET /api/health`: Check server status.
 - `POST /api/gemini/generate-questions`
   - Request body: `{ resumeText: string }`
   - Response: Array of question objects: `{ id, question, difficulty, timeLimit, expectedAnswer }`.
 - `POST /api/gemini/score-answer`
   - Request body: `{ question: object, answer: string, timeSpent: number }`
   - Response: `{ score: number, feedback: string }`.
 - `POST /api/gemini/generate-summary`
   - Request body: `{ answers: Array }`
   - Response: `{ score: number, summary: string }`.