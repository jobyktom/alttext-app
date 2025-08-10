
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// 5 MB per file limit (matches app requirement)
const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
if (!process.env.OPENAI_API_KEY) {
  console.warn("[WARN] OPENAI_API_KEY not set. /api endpoints will fail until it is configured.");
}

// Locale list expected by the frontend
const LOCALES = ["es-ES","it-IT","nl-NL","nl-BE","fr-FR","de-DE","de-AT"];

// Describe images (batch)
app.post("/api/describe", upload.array("files"), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) return res.json({ results: [] });

    const results = [];
    for (const f of files) {
      const b64 = Buffer.from(f.buffer).toString("base64");
      const mimetype = f.mimetype || "image/jpeg";

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You write concise, factual alt text (80-125 chars). Avoid 'image of' or 'picture of'." },
          {
            role: "user",
            content: [
              { type: "text", text: "Describe this image for alt text (80–125 characters). Be precise, no embellishment." },
              { type: "input_image", image_data: b64, mime_type: mimetype }
            ]
          }
        ],
        temperature: 0.2
      });

      const english_alt = (completion.choices?.[0]?.message?.content || "Descriptive alt text.").trim();
      results.push({ filename: f.originalname, english_alt });
    }

    res.json({ results });
  } catch (err) {
    console.error(err);
    res.status(500).send("Describe error");
  }
});

// Translate (batch)
app.post("/api/translate", async (req, res) => {
  try {
    const { items, locales } = req.body || {};
    if (!Array.isArray(items) || !Array.isArray(locales)) return res.status(400).send("Bad request");

    const rows = [];
    for (const it of items) {
      const row = {
        filename: it.filename,
        english_alt: it.english_alt,
        "es-ES": "",
        "it-IT": "",
        "nl-NL": "",
        "nl-BE": "",
        "fr-FR": "",
        "de-DE": "",
        "de-AT": ""
      };

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "Translate the given alt text into the requested locales exactly. Faithful meaning, no embellishment. Return strict JSON with keys matching the requested locales."
          },
          { role: "user", content: [{ type: "text", text: JSON.stringify({ text: it.english_alt, locales }) }] }
        ],
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const parsed = JSON.parse(completion.choices?.[0]?.message?.content || "{}");
      for (const lc of locales) row[lc] = parsed[lc] || "";

      rows.push(row);
    }

    res.json({ rows });
  } catch (err) {
    console.error(err);
    res.status(500).send("Translate error");
  }
});

// Serve React build
app.use(express.static(path.join(__dirname, "client", "dist")));
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server listening on " + PORT));
