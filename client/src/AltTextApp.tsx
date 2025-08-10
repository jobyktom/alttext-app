
import React, { useCallback, useMemo, useRef, useState } from "react";

interface Row {
  filename: string;
  english_alt: string;
  "es-ES": string;
  "it-IT": string;
  "nl-NL": string;
  "nl-BE": string;
  "fr-FR": string;
  "de-DE": string;
  "de-AT": string;
}

const LOCALES = [
  { key: "es-ES", label: "Spanish (Spain)" },
  { key: "it-IT", label: "Italian (Italy)" },
  { key: "nl-NL", label: "Dutch (Netherlands)" },
  { key: "nl-BE", label: "Dutch (Belgium)" },
  { key: "fr-FR", label: "French (France)" },
  { key: "de-DE", label: "German (Germany)" },
  { key: "de-AT", label: "German (Austria)" },
] as const;

const SUPPORTED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

// Same-origin base. When deployed to Railway one-service setup, this will work out of the box.
const API_BASE = "";

async function batchDescribe(files: File[]): Promise<Array<{ filename: string; english_alt: string }>> {
  const form = new FormData();
  files.forEach((f) => form.append("files", f, f.name));

  const res = await fetch(`${API_BASE}/api/describe`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Describe API failed (${res.status}). ${text}`);
  }
  const data = await res.json();
  if (!data?.results || !Array.isArray(data.results)) throw new Error("Bad describe API response");
  return data.results;
}

async function batchTranslate(
  items: Array<{ filename: string; english_alt: string }>,
  locales: Array<(typeof LOCALES)[number]["key"]>
): Promise<Row[]> {
  const res = await fetch(`${API_BASE}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, locales }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Translate API failed (${res.status}). ${text}`);
  }
  const data = await res.json();
  if (!data?.rows || !Array.isArray(data.rows)) throw new Error("Bad translate API response");
  return data.rows;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function useCSV(rows: Row[]) {
  const headers = useMemo(
    () => [
      "filename",
      "english_alt",
      "es-ES",
      "it-IT",
      "nl-NL",
      "nl-BE",
      "fr-FR",
      "de-DE",
      "de-AT",
    ],
    []
  );

  const toCSV = useCallback(() => {
    const escape = (val: string) => {
      const v = val ?? "";
      if (/[",\n]/.test(v)) {
        return '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    };
    const lines: string[] = [];
    lines.push(headers.join(","));
    rows.forEach((r) => {
      const vals = headers.map((h) => escape((r as any)[h] ?? ""));
      lines.push(vals.join(","));
    });
    return lines.join("\n");
  }, [rows, headers]);

  const download = useCallback(() => {
    const csv = toCSV();
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `alt-texts-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [toCSV]);

  return { headers, download };
}

export default function AltTextApp() {
  const [rows, setRows] = useState<Row[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { download } = useCSV(rows);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const asArray = Array.from(files);

    const newErrors: string[] = [];
    const validFiles: File[] = [];

    asArray.forEach((file) => {
      if (!SUPPORTED_MIME.has(file.type)) {
        newErrors.push(
          `${file.name} is not a supported image format (.jpg, .jpeg, .png, .webp).`
        );
      } else if (file.size > MAX_SIZE_BYTES) {
        newErrors.push(`${file.name} exceeds 5 MB. Please upload images up to 5 MB.`);
      } else {
        validFiles.push(file);
      }
    });

    setErrors((prev) => [...prev, ...newErrors]);
    if (validFiles.length === 0) return;

    setIsProcessing(true);
    try {
      // 1) Describe all images in a single API call
      const described = await batchDescribe(validFiles);

      // 2) Translate all English alts for all locales in a single API call
      const locales = LOCALES.map((l) => l.key);
      const completedRows = await batchTranslate(described, locales as any);

      setRows((prev) => [...prev, ...completedRows]);
    } catch (e: any) {
      setErrors((prev) => [...prev, e?.message || String(e)]);
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) handleFiles(e.target.files);
      e.currentTarget.value = "";
    },
    [handleFiles]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const files = e.dataTransfer.files;
      if (files && files.length) handleFiles(files);
    },
    [handleFiles]
  );

  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const clearRows = useCallback(() => setRows([]), []);
  const clearErrors = useCallback(() => setErrors([]), []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">Multilingual Alt-Text Generator</h1>
          <p className="text-sm text-gray-600 mt-1">
            Upload or drag & drop images (JPG, PNG, WEBP). Max size 5 MB each. Generates
            English alt text and translations, then export as CSV.
          </p>
        </header>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className={classNames(
            "rounded-2xl border-2 border-dashed p-8 transition shadow-sm",
            "bg-white",
            isProcessing ? "opacity-80" : "",
          )}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="text-center">
              <div className="text-lg font-medium">Drag & drop images here</div>
              <div className="text-sm text-gray-600">or</div>
            </div>
            <button
              onClick={() => inputRef.current?.click()}
              className="px-4 py-2 rounded-xl shadow bg-black text-white text-sm"
              disabled={isProcessing}
            >
              Browse files
            </button>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              multiple
              onChange={onInputChange}
            />
            {isProcessing && (
              <div className="text-sm text-gray-700">Processing… analyzing images and generating translations.</div>
            )}
          </div>
        </div>

        {errors.length > 0 and (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-4">
            <div className="flex items-start gap-3">
              <div className="font-semibold text-red-800">Errors</div>
              <div className="text-sm text-red-800/90 space-y-1">
                {errors.map((e, i) => (
                  <div key={i}>• {e}</div>
                ))}
              </div>
              <div className="ml-auto">
                <button
                  onClick={clearErrors}
                  className="text-xs px-3 py-1 rounded-lg bg-red-600 text-white shadow"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 bg-white rounded-2xl shadow-sm border">
          <div className="flex items-center justify-between p-4">
            <div className="font-medium">Results</div>
            <div className="flex items-center gap-2">
              <button
                onClick={download}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-sm shadow disabled:opacity-60"
                disabled={rows.length === 0}
                title={rows.length === 0 ? "No data to export" : "Download CSV"}
              >
                Download CSV
              </button>
              <button
                onClick={clearRows}
                className="px-3 py-1.5 rounded-xl bg-gray-200 text-gray-900 text-sm shadow disabled:opacity-60"
                disabled={rows.length === 0}
              >
                Clear Table
              </button>
            </div>
          </div>

          <div className="overflow-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="text-left px-4 py-2 whitespace-nowrap">filename</th>
                  <th className="text-left px-4 py-2">english_alt</th>
                  <th className="text-left px-4 py-2">es-ES</th>
                  <th className="text-left px-4 py-2">it-IT</th>
                  <th className="text-left px-4 py-2">nl-NL</th>
                  <th className="text-left px-4 py-2">nl-BE</th>
                  <th className="text-left px-4 py-2">fr-FR</th>
                  <th className="text-left px-4 py-2">de-DE</th>
                  <th className="text-left px-4 py-2">de-AT</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-gray-500" colSpan={9}>
                      No results yet. Upload images to generate alt text and translations.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className={i % 2 ? "bg-white" : "bg-gray-50/60"}>
                      <td className="align-top px-4 py-2 whitespace-nowrap font-medium">{r.filename}</td>
                      <td className="align-top px-4 py-2 min-w-[22rem]">{r.english_alt}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["es-ES"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["it-IT"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["nl-NL"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["nl-BE"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["fr-FR"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["de-DE"]}</td>
                      <td className="align-top px-4 py-2 min-w-[18rem]">{r["de-AT"]}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
