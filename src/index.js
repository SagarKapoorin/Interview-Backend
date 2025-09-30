const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const axios = require("axios");
const CircuitBreaker = require("opossum");
const { v4: uuidv4 } = require("uuid");
require("dotenv").config();

const app = express();
const corsOptions = {};
if (process.env.CORS_ALLOWED_ORIGINS) {
  corsOptions.origin = process.env.CORS_ALLOWED_ORIGINS.split(',');
}
app.use(cors(corsOptions));
app.use(bodyParser.json());

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Error: GEMINI_API_KEY is not set in environment");
  process.exit(1);
}

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

const geminiOptions = {
  timeout: 500000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
};

const geminiBreaker = new CircuitBreaker(
  async (payload) => {
    const res = await axios.post(GEMINI_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
    });
    return res.data;
  },
  geminiOptions
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/gemini/generate-questions", async (req, res) => {
  const { resumeText }=req.body;
  if (!resumeText) {
    return res.status(400).json({ error: "Missing resumeText in request body" });
  }

  try {
    const systemPrompt =
      "You are an AI assistant that generates interview questions for a Full Stack Developer role focusing on React and Node.js. You will create exactly 6 questions: first 2 Easy, then 2 Medium, then 2 Hard. Return only a JSON array of objects with keys: question (string), difficulty (Easy, Medium, Hard), timeLimit (number of seconds). Do not include any extra text.";

    const userPrompt = `Generate 6 interview questions for a Full Stack (React/Node.js) developer based on the following resume. The questions should be ordered: first 2 Easy, next 2 Medium, last 2 Hard.\nResume:\n${resumeText}`;

    const payload = {
      contents: [
        { parts: [{ text: `Context: ${systemPrompt}\n\nUser: ${userPrompt}` }] },
      ],
      generationConfig: { temperature: 0.7 },
    };
    const data = await geminiBreaker.fire(payload);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('No content returned from Gemini API');
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
    }
    let questions;
    try {
      questions = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error('Parse error. Raw Gemini output:', raw);
      throw new Error('Failed to parse response as JSON array');
    }
    if (!Array.isArray(questions)) {
      throw new Error('Invalid response format: expected a JSON array');
    }
    const formatted = questions.map((q) => ({
      id: uuidv4(),
      question: q.question,
      difficulty: q.difficulty,
      timeLimit: q.timeLimit,
      expectedAnswer: q.expectedAnswer || null,
    }));
    return res.json(formatted);
  } catch (err) {
    console.error("Failed to generate questions:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to generate questions" });
  }
});

app.post("/api/gemini/score-answer", async (req, res) => {
  const { question, answer, timeSpent } = req.body;
  if (!question || !answer || timeSpent == null) {
    return res
      .status(400)
      .json({ error: "Missing fields in request body" });
  }

  try {
    const systemPrompt =
      "You are an AI assistant that scores interview answers. Provide only a JSON object with keys: score (integer between 0 and 100), feedback (string). Do not include extra text.";

    const userPrompt = `Question: ${question.question}\nDifficulty: ${question.difficulty}\nTime limit: ${question.timeLimit}\nCandidate answer: ${answer}\nTime spent: ${timeSpent}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    };

    const data = await geminiBreaker.fire(payload);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("No content returned from Gemini API");
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
    }
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Parse error. Raw Gemini output:", raw);
      throw new Error("Failed to parse scoring result as JSON");
    }
    if (typeof result.score === 'number') {
      if (result.score <= 1) {
        result.score = Math.round(result.score * 100);
      } else {
        result.score = Math.round(result.score);
      }
    }
    return res.json(result);
  } catch (err) {
    console.error("Failed to score answer:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to score answer" });
  }
});

app.post("/api/gemini/generate-summary", async (req, res) => {
  const { answers } = req.body;
  if (!Array.isArray(answers)) {
    return res
      .status(400)
      .json({ error: "Missing answers array in request body" });
  }

  try {
    const systemPrompt =
      "You are an AI assistant that summarizes interview answers and computes a final score. Provide only a JSON object with keys: score (integer between 0 and 100), summary (string). Do not include extra text.";

    const userPrompt = `Here are the candidate's answers:\n${JSON.stringify(
      answers,
      null,
      2
    )}`;

    const payload = {
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
      },
    };

    const data = await geminiBreaker.fire(payload);
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("No content returned from Gemini API");
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '');
    }
    let result;
    try {
      result = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("Parse error. Raw Gemini output:", raw);
      throw new Error("Failed to parse summary result as JSON");
    }
    if (typeof result.score === 'number') {
      if (result.score <= 1) {
        result.score = Math.round(result.score * 100);
      } else {
        result.score = Math.round(result.score);
      }
    }
    return res.json(result);
  } catch (err) {
    console.error("Failed to generate summary:", err.response?.data || err.message || err);
    return res.status(500).json({ error: "Failed to generate summary" });
  }
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
