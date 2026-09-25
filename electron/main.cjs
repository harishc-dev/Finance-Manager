const { app, BrowserWindow, ipcMain, dialog, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const XLSX = require('xlsx');
const pdfParse = require('pdf-parse');

const isDev = !app.isPackaged;
const root = app.getPath('userData');
const vaultDir = path.join(root, 'vault');
const vaultFile = path.join(vaultDir, 'vault.enc');
const attachDir = path.join(vaultDir, 'attachments');
fs.mkdirSync(attachDir, { recursive: true });

// Auto-migrate from previous app names if current vault is missing or empty default
try {
  const legacyPaths = [
    path.join(app.getPath('appData'), 'neon-portfolio-manager', 'vault', 'vault.enc'),
    path.join(app.getPath('appData'), 'neon-manager', 'vault', 'vault.enc')
  ];
  for (const legPath of legacyPaths) {
    if (fs.existsSync(legPath)) {
      const legStat = fs.statSync(legPath);
      const curStat = fs.existsSync(vaultFile) ? fs.statSync(vaultFile) : null;
      if ((!curStat || curStat.size < 1500) && legStat.size >= 1500) {
        fs.mkdirSync(vaultDir, { recursive: true });
        fs.copyFileSync(legPath, vaultFile);
        const legAttach = path.join(path.dirname(legPath), 'attachments');
        if (fs.existsSync(legAttach)) {
          fs.cpSync(legAttach, attachDir, { recursive: true, errorOnExist: false });
        }
        break;
      }
    }
  }
} catch (e) {
  // Silent fallback
}

function deriveKeyAsync(passwordBuffer, saltBuffer) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(passwordBuffer, saltBuffer, 32, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

async function encryptObject(obj, password) {
  const pwBuf = Buffer.from(password, 'utf8');
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  let key = null;
  let jsonBuf = null;
  try {
    key = await deriveKeyAsync(pwBuf, salt);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    jsonBuf = Buffer.from(JSON.stringify(obj), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(jsonBuf), cipher.final()]);
    const tag = cipher.getAuthTag();
    return JSON.stringify({
      v: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64')
    });
  } finally {
    pwBuf.fill(0);
    if (jsonBuf) jsonBuf.fill(0);
    if (key && Buffer.isBuffer(key)) key.fill(0);
  }
}

async function decryptObject(blob, password) {
  const pwBuf = Buffer.from(password, 'utf8');
  const m = JSON.parse(blob);
  const salt = Buffer.from(m.salt, 'base64');
  const iv = Buffer.from(m.iv, 'base64');
  const tag = Buffer.from(m.tag, 'base64');
  const encData = Buffer.from(m.data, 'base64');
  let key = null;
  let decrypted = null;
  try {
    key = await deriveKeyAsync(pwBuf, salt);
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    decrypted = Buffer.concat([d.update(encData), d.final()]);
    const str = decrypted.toString('utf8');
    return JSON.parse(str);
  } finally {
    pwBuf.fill(0);
    if (decrypted) decrypted.fill(0);
    if (key && Buffer.isBuffer(key)) key.fill(0);
  }
}

function defaultVault() {
  return {schema:2,createdAt:new Date().toISOString(),profile:{name:'Primary',currency:'INR'},family:[{id:crypto.randomUUID(),name:'Me',relation:'Self'}],holdings:[],transactions:[],liabilities:[],documents:[],importLog:[],settings:{aiProvider:'gemini',geminiApiKey:'',geminiModel:'gemini-2.5-flash',ollamaUrl:'http://127.0.0.1:11434',ollamaModel:'qwen2.5:3b'}};
}

async function readVault(password){
  if(!fs.existsSync(vaultFile)) return {exists:false,vault:defaultVault()};
  const raw = fs.readFileSync(vaultFile,'utf8');
  const vault = await decryptObject(raw, password);
  return {exists:true,vault};
}

async function writeVault(password,vault){
  fs.mkdirSync(vaultDir,{recursive:true});
  const tmp=vaultFile+'.tmp';
  const encrypted = await encryptObject(vault,password);
  fs.writeFileSync(tmp,encrypted);
  fs.renameSync(tmp,vaultFile);
}

ipcMain.handle('vault:exists',()=>fs.existsSync(vaultFile));
ipcMain.handle('vault:open',async(_,password)=>{try{return {ok:true,...await readVault(password)}}catch{return {ok:false,error:'Incorrect master password or damaged vault.'}}});
ipcMain.handle('vault:create',async(_,password)=>{if(fs.existsSync(vaultFile))return {ok:false,error:'Vault already exists.'};const vault=defaultVault();await writeVault(password,vault);return {ok:true,vault};});
ipcMain.handle('vault:save',async(_,p)=>{try{await writeVault(p.password,p.vault);return {ok:true}}catch(e){return {ok:false,error:e.message}}});

function csvRows(text){
  const parsed=XLSX.read(text,{type:'string'}); const ws=parsed.Sheets[parsed.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws,{defval:'',raw:false});
}
async function inspectFile(filePath,name){
  const ext=path.extname(name||filePath).toLowerCase();
  if(['.xlsx','.xls'].includes(ext)){
    const wb=XLSX.readFile(filePath,{cellDates:true,cellNF:true});
    return {kind:'spreadsheet',name,sourcePath:filePath,sheets:wb.SheetNames.map(sheet=>({sheet,rows:XLSX.utils.sheet_to_json(wb.Sheets[sheet],{defval:'',raw:false})}))};
  }
  if(ext==='.csv'){return {kind:'spreadsheet',name,sourcePath:filePath,sheets:[{sheet:'CSV',rows:csvRows(fs.readFileSync(filePath,'utf8'))}]};}
  if(ext==='.pdf'){const buf=fs.readFileSync(filePath);let text='';try{text=(await pdfParse(buf)).text||'';}catch{}return {kind:'pdf',name,sourcePath:filePath,text,pages:(text?text.split(/\f/).length:0),data:buf.toString('base64'),mime:'application/pdf'};}
  if(['.txt','.json'].includes(ext))return {kind:'text',name,sourcePath:filePath,text:fs.readFileSync(filePath,'utf8')};
  if(['.png','.jpg','.jpeg','.webp'].includes(ext))return {kind:'image',name,sourcePath:filePath,data:fs.readFileSync(filePath).toString('base64'),mime:'image/'+(ext==='.jpg'||ext==='.jpeg'?'jpeg':ext.slice(1))};
  return {kind:'binary',name};
}
ipcMain.handle('file:analyze',async(_,p)=>{try{return {ok:true,...await inspectFile(p.filePath,p.name)}}catch(e){return {ok:false,error:e.message}}});

// Gemini legacy generateContent response schema.
//
// IMPORTANT:
// Keep this schema compatible with the REST Schema protobuf used by
// generateContent. Do NOT use:
//   - type: ["string", "null"]
//   - additionalProperties
//   - arbitrary JSON-schema constructs
//
// We use empty strings / 0 for "not available" values and normalize them
// after Gemini responds.

const GEMINI_SCHEMA = {
  type: "OBJECT",
  properties: {
    documentType: {
      type: "STRING",
      description:
        "Document type: CAS, P&L, broker_statement, contract_note, mutual_fund_statement, bank_statement, FD_statement, bond_statement, portfolio_statement, transaction_ledger, other."
    },

    provider: {
      type: "STRING",
      description:
        "Provider, broker, depository, AMC, bank or platform name."
    },

    accountHolder: {
      type: "STRING",
      description:
        "Account holder name exactly as visible in the document."
    },

    asOfDate: {
      type: "STRING",
      description:
        "Statement/holding valuation date as YYYY-MM-DD. Empty string if unavailable."
    },

    currency: {
      type: "STRING",
      description:
        "Currency such as INR or USD."
    },

    confidence: {
      type: "NUMBER",
      description: "Overall extraction confidence between 0 and 1."
    },

    warnings: {
      type: "ARRAY",
      items: {
        type: "STRING"
      }
    },

    holdings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: {
            type: "STRING"
          },

          symbol: {
            type: "STRING"
          },

          isin: {
            type: "STRING"
          },

          type: {
            type: "STRING",
            enum: [
              "Stock",
              "Mutual Fund",
              "ETF",
              "Bond",
              "FD",
              "Cash",
              "Gold",
              "Crypto",
              "REIT",
              "Other"
            ]
          },

          quantity: {
            type: "NUMBER"
          },

          avgCost: {
            type: "NUMBER"
          },

          currentPrice: {
            type: "NUMBER"
          },

          marketValue: {
            type: "NUMBER"
          },

          costValue: {
            type: "NUMBER"
          },

          positionState: {
            type: "STRING",
            enum: [
              "ACTIVE",
              "ZERO",
              "UNKNOWN"
            ]
          },

          snapshot: {
            type: "BOOLEAN"
          },

          ownerHint: {
            type: "STRING"
          },

          evidence: {
            type: "STRING"
          },

          folio: {
            type: "STRING",
            description: "Folio number for mutual funds if present. Empty string otherwise."
          },

          confidence: {
            type: "NUMBER"
          }
        },

        required: [
          "name",
          "symbol",
          "isin",
          "folio",
          "type",
          "quantity",
          "avgCost",
          "currentPrice",
          "marketValue",
          "costValue",
          "positionState",
          "snapshot",
          "ownerHint",
          "evidence",
          "confidence"
        ]
      }
    },

    transactions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          date: {
            type: "STRING"
          },

          type: {
            type: "STRING",
            enum: [
              "BUY",
              "SELL",
              "DIVIDEND",
              "INTEREST",
              "DEPOSIT",
              "WITHDRAWAL",
              "FEE",
              "OTHER"
            ]
          },

          name: {
            type: "STRING"
          },

          symbol: {
            type: "STRING"
          },

          isin: {
            type: "STRING"
          },

          quantity: {
            type: "NUMBER"
          },

          price: {
            type: "NUMBER"
          },

          amount: {
            type: "NUMBER"
          },

          currency: {
            type: "STRING"
          },

          ownerHint: {
            type: "STRING"
          },

          evidence: {
            type: "STRING"
          },

          confidence: {
            type: "NUMBER"
          }
        },

        required: [
          "date",
          "type",
          "name",
          "symbol",
          "isin",
          "quantity",
          "price",
          "amount",
          "currency",
          "ownerHint",
          "evidence",
          "confidence"
        ]
      }
    }
  },

  required: [
    "documentType",
    "provider",
    "accountHolder",
    "asOfDate",
    "currency",
    "confidence",
    "warnings",
    "holdings",
    "transactions"
  ]
};
function mimeForPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.txt':'text/plain','.json':'application/json','.csv':'text/csv'})[ext] || 'application/octet-stream';
}

async function geminiUploadFile(apiKey, filePath, displayName, mimeType) {
  const stat = fs.statSync(filePath);
  if (stat.size > 50 * 1024 * 1024 && mimeType === 'application/pdf') throw new Error("PDF is larger than Gemini\'s 50 MB file-input limit.");
  const start = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(stat.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ file: { display_name: displayName.slice(0, 512) } })
  });
  if (!start.ok) throw new Error(`Gemini file upload start failed (${start.status}): ${await start.text()}`);
  const uploadUrl = start.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini did not return an upload URL.');
  const data = fs.readFileSync(filePath);
  try {
    const done = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Length': String(data.length),
        'X-Goog-Upload-Offset': '0',
        'X-Goog-Upload-Command': 'upload, finalize'
      },
      body: data
    });
    if (!done.ok) throw new Error(`Gemini file upload failed (${done.status}): ${await done.text()}`);
    let fileData = (await done.json()).file;

    // Poll Google Files API until file state is ACTIVE (prevents state rejection on large multi-page scanned PDFs)
    if (fileData && fileData.state === 'PROCESSING') {
      const maxWaitMs = 120000;
      const pollIntervalMs = 2000;
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        await new Promise(r => setTimeout(r, pollIntervalMs));
        const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileData.name}?key=${encodeURIComponent(apiKey)}`);
        if (checkRes.ok) {
          fileData = await checkRes.json();
          if (fileData.state === 'ACTIVE') break;
          if (fileData.state === 'FAILED') {
            throw new Error(`Gemini file processing failed: ${fileData.error?.message || 'Unknown processing error'}`);
          }
        }
      }
      if (fileData.state !== 'ACTIVE') {
        throw new Error('Gemini file processing timed out waiting for state ACTIVE.');
      }
    }
    return fileData;
  } finally {
    data.fill(0);
  }
}

async function geminiDeleteFile(apiKey, fileName) {
  if (!fileName) return;
  try { await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' }); } catch {}
}

function cleanJsonText(txt) {
  const trimmed = String(txt || '').trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  const first = trimmed.indexOf('{');
  const last = trimmed.lastIndexOf('}');
  return first >= 0 && last >= first ? trimmed.slice(first, last + 1) : trimmed;
}
function normalizeGeminiResult(raw) {
  const r = raw && typeof raw === "object"
    ? raw
    : {};

  const str = (v) =>
    v === null || v === undefined
      ? ""
      : String(v).trim();

  const num = (v) => {
    if (
      v === null ||
      v === undefined ||
      v === ""
    ) {
      return null;
    }

    const n = Number(v);

    return Number.isFinite(n)
      ? n
      : null;
  };

  const conf = (v) => {
    const n = Number(v);

    if (!Number.isFinite(n)) {
      return 0;
    }

    return Math.max(
      0,
      Math.min(1, n)
    );
  };

  const holdings = Array.isArray(r.holdings)
    ? r.holdings.map((h) => {
        const quantity =
          num(h.quantity) ?? 0;

        const marketValue =
          num(h.marketValue);

        let currentPrice =
          num(h.currentPrice);

        /*
         * If Gemini gives market value + quantity but doesn't explicitly
         * provide price, derive it.
         */
        if (
          currentPrice === null &&
          marketValue !== null &&
          quantity > 0
        ) {
          currentPrice =
            marketValue / quantity;
        }

        const positionState =
          ["ACTIVE", "ZERO", "UNKNOWN"].includes(
            h.positionState
          )
            ? h.positionState
            : (
                quantity > 0
                  ? "ACTIVE"
                  : "UNKNOWN"
              );

        return {
          name: str(h.name),
          symbol: str(h.symbol),
          isin: str(h.isin),
          folio: str(h.folio),

          type: [
            "Stock",
            "Mutual Fund",
            "ETF",
            "Bond",
            "FD",
            "Cash",
            "Gold",
            "Crypto",
            "REIT",
            "Other"
          ].includes(h.type)
            ? h.type
            : "Other",

          quantity,

          avgCost: num(h.avgCost),

          currentPrice,

          marketValue,

          costValue: num(h.costValue),

          positionState,

          /*
           * CAS / portfolio documents containing a positive holding
           * are automatically considered snapshots.
           */
          snapshot:
            Boolean(h.snapshot) ||
            quantity > 0,

          ownerHint: str(h.ownerHint),

          evidence: str(h.evidence),

          confidence: conf(h.confidence)
        };
      })
    : [];

  const transactions =
    Array.isArray(r.transactions)
      ? r.transactions.map((t) => ({
          date: str(t.date),

          type: [
            "BUY",
            "SELL",
            "DIVIDEND",
            "INTEREST",
            "DEPOSIT",
            "WITHDRAWAL",
            "FEE",
            "OTHER"
          ].includes(t.type)
            ? t.type
            : "OTHER",

          name: str(t.name),
          symbol: str(t.symbol),
          isin: str(t.isin),

          quantity:
            num(t.quantity) ?? 0,

          price: num(t.price),

          amount:
            num(t.amount) ?? 0,

          currency:
            str(t.currency) ||
            str(r.currency) ||
            "INR",

          ownerHint:
            str(t.ownerHint),

          evidence:
            str(t.evidence),

          confidence:
            conf(t.confidence)
        }))
      : [];

  return {
    documentType:
      str(r.documentType) ||
      "other",

    provider:
      str(r.provider) ||
      "Unknown",

    accountHolder:
      str(r.accountHolder),

    asOfDate:
      str(r.asOfDate),

    currency:
      str(r.currency) ||
      "INR",

    confidence:
      conf(r.confidence),

    warnings:
      Array.isArray(r.warnings)
        ? r.warnings
            .map(str)
            .filter(Boolean)
        : [],

    holdings,

    transactions
  };
}
async function geminiAnalyze(apiKey, model, doc, context) {
  if (!apiKey) {
    throw new Error("Gemini API key is missing.");
  }

  const prompt = `
You are the financial-document extraction engine of a personal finance
portfolio application.

You are analyzing the ORIGINAL financial document attached to this request.

The document can be ANY financial document and its layout may be completely
different from other documents.

Possible documents include:

- CDSL CAS
- NSDL CAS
- Groww statement
- Groww P&L
- INDmoney statement
- broker statement
- contract note
- mutual fund statement
- portfolio statement
- transaction ledger
- bank statement
- FD statement
- bond statement
- US stock statement
- tax/P&L report
- scanned PDF
- image of a financial document

DO NOT assume a fixed column structure.

Read the actual document.

========================================
MOST IMPORTANT REQUIREMENT
========================================

If the document contains a CURRENT HOLDINGS / DEMAT HOLDINGS /
MUTUAL FUND HOLDINGS / PORTFOLIO HOLDINGS section, extract EVERY holding.

For a CAS specifically:

- Every security listed under current holdings is a HOLDING.
- Set snapshot=true for those holdings.
- Set positionState="ACTIVE" when quantity is greater than zero.
- If the document explicitly shows a zero balance, set positionState="ZERO".
- Do NOT leave valid CAS holdings as snapshot=false.

A CAS is normally a point-in-time holdings snapshot.

========================================
SECURITY IDENTIFICATION
========================================

For each holding extract:

1. Security name
2. ISIN
3. Ticker/symbol if available
4. Asset type
5. Quantity/units
6. Current market price or NAV if explicitly shown
7. Market value
8. Cost value if explicitly shown
9. Average cost if explicitly shown
10. Account holder / owner
11. Statement date

ISIN is the strongest identifier for Indian securities.

If there is no ISIN, use ticker/symbol.

If neither exists, use the security name.

Never invent identifiers.

========================================
IMPORTANT PRICE RULE
========================================

currentPrice must be the ACTUAL current/closing/NAV price reported by
the document.

Never use:

- total market value
- total cost
- purchase price
- sale price
- realized P&L
- unrealized P&L

as currentPrice.

If market value and quantity are explicitly available but price is not,
you MAY calculate:

currentPrice = marketValue / quantity

Set the evidence to say that the price was calculated from market value
and quantity.

========================================
MUTUAL FUNDS
========================================

For mutual funds:

quantity = units

currentPrice = NAV

marketValue = current valuation

Do not confuse folio number with quantity.

========================================
STOCKS
========================================

For stocks:

quantity = shares

currentPrice = explicit market/closing price if available.

========================================
BONDS / FD
========================================

For bonds and fixed deposits, preserve the economic meaning.

Do not treat an INR principal amount as a stock share quantity.

========================================
TRANSACTIONS
========================================

Extract transactions separately.

A BUY/SELL transaction is NOT itself a current holding.

A P&L amount is NOT a transaction amount.

A dividend is a transaction.

Interest is a transaction.

========================================
ZERO / MISSING HOLDINGS
========================================

If a holding is explicitly shown as zero or closed:

positionState = "ZERO"
snapshot = true

If a security is simply absent from a document:

DO NOT assume it was sold.

========================================
EVIDENCE
========================================

Every holding must contain a short evidence description.

Example:

"CDSL CAS equity holdings table: RELIANCE INDUSTRIES LTD,
ISIN INE002A01018, quantity 25, market value INR 71875."

========================================
CONFIDENCE
========================================

Use 0 to 1.

A clearly visible table row with ISIN and quantity should have high confidence.

An ambiguous OCR row should have lower confidence.

========================================
EXISTING PORTFOLIO
========================================

This is the existing portfolio.

Use it ONLY for matching securities.

NEVER invent missing document data from the existing portfolio.

${JSON.stringify(context)}

========================================
OUTPUT
========================================

Return ONLY JSON matching the supplied schema.

Extract ALL reliable holdings.

Do not return a summary.

Do not omit holdings because the document uses an unusual layout.
`;

  let uploaded = null;

  try {
    const ext = path.extname(doc.sourcePath || "").toLowerCase();

    const directFile = [
      ".pdf",
      ".png",
      ".jpg",
      ".jpeg",
      ".webp",
      ".txt",
      ".json",
      ".csv"
    ].includes(ext);

    let parts = [
      {
        text: prompt
      }
    ];

    if (
      directFile &&
      doc.sourcePath &&
      fs.existsSync(doc.sourcePath)
    ) {
      const mime = mimeForPath(doc.sourcePath);

      uploaded = await geminiUploadFile(
        apiKey,
        doc.sourcePath,
        doc.name,
        mime
      );

      if (!uploaded?.uri) {
        throw new Error(
          "Gemini file upload returned no file URI."
        );
      }

      parts.push({
        file_data: {
          mime_type: uploaded.mimeType || mime,
          file_uri: uploaded.uri
        }
      });
    } else {
      const content =
        doc.kind === "spreadsheet"
          ? JSON.stringify(doc.sheets)
          : String(doc.text || "");

      parts.push({
        text:
          `DOCUMENT DATA (${doc.name}):\n` +
          content.slice(0, 1200000)
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        model
      )}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts
            }
          ],

          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
            responseSchema: GEMINI_SCHEMA
          }
        })
      }
    );

    const responseText = await res.text();

    if (!res.ok) {
      let detail = responseText;

      try {
        const apiError = JSON.parse(responseText);
        detail =
          apiError?.error?.message ||
          apiError?.error?.status ||
          responseText;
      } catch {}

      throw new Error(
        `Gemini analysis failed (${res.status}): ${detail}`
      );
    }

    let body;

    try {
      body = JSON.parse(responseText);
    } catch {
      throw new Error("Gemini returned an invalid API response.");
    }

    const candidate = body?.candidates?.[0];

    const txt =
      candidate?.content?.parts
        ?.map((x) => x.text || "")
        .join("") || "";

    if (!txt) {
      const reason =
        candidate?.finishReason ||
        body?.promptFeedback?.blockReason ||
        "UNKNOWN";

      throw new Error(
        `Gemini returned no structured analysis (reason: ${reason}).`
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(cleanJsonText(txt));
    } catch (e) {
      throw new Error(
        `Gemini returned invalid JSON: ${e.message}`
      );
    }

    return normalizeGeminiResult(parsed);
  } finally {
    await geminiDeleteFile(
      apiKey,
      uploaded?.name
    );
  }
}
async function ollamaAnalyze(url,model,doc,context){
  const prompt=`Extract this financial document into strict JSON. You may see any provider/layout. Return ONLY JSON: {"documentType":"","provider":"","asOfDate":null,"currency":"INR","confidence":0,"warnings":[],"holdings":[{"name":"","symbol":"","isin":"","type":"Stock|Mutual Fund|ETF|Bond|FD|Cash|Gold|Crypto|REIT|Other","quantity":0,"avgCost":null,"currentPrice":null,"marketValue":null,"costValue":null,"ownerHint":"","status":"ACTIVE|ZERO|UNKNOWN"}],"transactions":[{"date":"YYYY-MM-DD","type":"BUY|SELL|DIVIDEND|INTEREST|DEPOSIT|WITHDRAWAL|FEE|OTHER","name":"","symbol":"","isin":"","quantity":0,"price":null,"amount":0,"currency":"","ownerHint":""}]}. Never invent values. Match by ISIN/ticker/name. Existing vault: ${JSON.stringify(context)}\nDocument: ${JSON.stringify(doc.kind==='spreadsheet'?doc.sheets:doc.text||doc.name).slice(0,250000)}`;
  const res=await fetch(url.replace(/\/$/,'')+'/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:prompt}],stream:false,format:'json',options:{temperature:0}})});
  if(!res.ok)throw new Error(`Ollama HTTP ${res.status}`);const body=await res.json();return JSON.parse(body.message.content);
}
ipcMain.handle('ai:analyze',async(_,p)=>{try{const provider=p.provider||'auto';const errors=[];const visualOnly=(p.doc.kind==='image'||(p.doc.kind==='pdf'&&!p.doc.text));
  if((provider==='local'||provider==='auto')&&!visualOnly&&p.ollamaUrl){try{const local=await ollamaAnalyze(p.ollamaUrl,p.ollamaModel,p.doc,p.context);if(provider==='local'||((local?.holdings?.length||0)>0&&Number(local?.confidence||0)>=0.55))return {ok:true,engine:'local',result:local};}catch(e){errors.push('Local AI: '+e.message);}}
  if((provider==='gemini'||provider==='auto')&&p.geminiApiKey){try{return {ok:true,engine:'gemini',result:await geminiAnalyze(p.geminiApiKey,p.geminiModel,p.doc,p.context)}}catch(e){errors.push('Gemini: '+e.message);}}
  if(provider==='auto'&&p.ollamaUrl&&!visualOnly){try{return {ok:true,engine:'local',result:await ollamaAnalyze(p.ollamaUrl,p.ollamaModel,p.doc,p.context)}}catch(e){errors.push('Local AI: '+e.message);}}
  return {ok:false,error:errors.join(' | ')||'No AI engine configured. Configure Ollama or Gemini in Settings.'};}catch(e){return {ok:false,error:e.message}}});

ipcMain.handle('file:saveEncrypted', async (_, p) => {
  const pwBuf = Buffer.from(p.password, 'utf8');
  const rawBuf = Buffer.from(p.buffer);
  let key = null;
  try {
    const salt = crypto.randomBytes(16);
    const iv = crypto.randomBytes(12);
    key = await deriveKeyAsync(pwBuf, salt);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([c.update(rawBuf), c.final()]);
    const payload = Buffer.from(JSON.stringify({
      v: 1,
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: c.getAuthTag().toString('base64'),
      data: ct.toString('base64')
    }));
    const filePath = path.join(attachDir, p.id + '.bin');
    fs.writeFileSync(filePath, payload);
    return { ok: true, filePath, name: p.name, mime: p.mime };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    pwBuf.fill(0);
    rawBuf.fill(0);
    if (key && Buffer.isBuffer(key)) key.fill(0);
  }
});

ipcMain.handle('file:openEncrypted', async (_, p) => {
  const pwBuf = Buffer.from(p.password, 'utf8');
  let key = null;
  let decrypted = null;
  try {
    const m = JSON.parse(fs.readFileSync(path.join(attachDir, p.id + '.bin'), 'utf8'));
    const salt = Buffer.from(m.salt, 'base64');
    const iv = Buffer.from(m.iv, 'base64');
    const tag = Buffer.from(m.tag, 'base64');
    const encData = Buffer.from(m.data, 'base64');
    key = await deriveKeyAsync(pwBuf, salt);
    const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
    d.setAuthTag(tag);
    decrypted = Buffer.concat([d.update(encData), d.final()]);
    const b64 = decrypted.toString('base64');
    return { ok: true, data: b64 };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    pwBuf.fill(0);
    if (decrypted) decrypted.fill(0);
    if (key && Buffer.isBuffer(key)) key.fill(0);
  }
});

ipcMain.handle('file:deleteEncrypted', async (_, p) => {
  try {
    if (!p?.id) return { ok: false, error: 'Missing document id' };
    const filePath = path.join(attachDir, p.id + '.bin');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('file:purgeExpired', async (_, p) => {
  try {
    const deleted = [];
    const ids = Array.isArray(p?.ids) ? p.ids : [];
    for (const id of ids) {
      if (!id) continue;
      const filePath = path.join(attachDir, id + '.bin');
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          deleted.push(id);
        } catch (_) {}
      }
    }
    return { ok: true, deleted };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('file:pick', async () => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Finance files', extensions: ['csv', 'xlsx', 'xls', 'pdf', 'json', 'txt', 'png', 'jpg', 'jpeg', 'webp'] },
      { name: 'All files', extensions: ['*'] }
    ]
  });
  if (r.canceled) return { ok: false, files: [] };
  return { ok: true, files: r.filePaths.map(p => ({ path: p, name: path.basename(p), size: fs.statSync(p).size })) };
});

ipcMain.handle('file:readBytes', (_, p) => {
  try {
    return { ok: true, data: fs.readFileSync(p).toString('base64'), name: path.basename(p) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('app:backup', async (event, p = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const dateStr = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, {
      title: 'Export Encrypted Backup',
      defaultPath: `FinanceManager-Backup-${dateStr}.fmvault`,
      filters: [
        { name: 'Finance Manager Vault (*.fmvault, *.enc)', extensions: ['fmvault', 'enc'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    if (r.canceled || !r.filePath) return { ok: false, cancelled: true };
    if (!fs.existsSync(vaultFile)) return { ok: false, error: 'No active vault file found to back up.' };

    if (p.password) {
      try {
        const raw = fs.readFileSync(vaultFile, 'utf8');
        await decryptObject(raw, p.password);
      } catch {
        return { ok: false, error: 'Incorrect master password — backup export cancelled.' };
      }
    }

    fs.copyFileSync(vaultFile, r.filePath);
    return { ok: true, path: r.filePath, filename: path.basename(r.filePath) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:import', async (event, p = {}) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    const r = await dialog.showOpenDialog(win, {
      title: 'Import Vault Backup',
      filters: [
        { name: 'Finance Manager Vault (*.fmvault, *.enc, *.vault)', extensions: ['fmvault', 'enc', 'vault'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (r.canceled || !r.filePaths || r.filePaths.length === 0) return { ok: false, cancelled: true };

    const chosenPath = r.filePaths[0];
    const raw = fs.readFileSync(chosenPath, 'utf8');

    if (p.password) {
      try {
        const vault = await decryptObject(raw, p.password);
        return { ok: true, filePath: chosenPath, filename: path.basename(chosenPath), vault };
      } catch {
        return { ok: false, error: 'Incorrect password for this backup file, or file is corrupted.' };
      }
    }

    return { ok: true, filePath: chosenPath, filename: path.basename(chosenPath), requiresPassword: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('app:restore', async (_, { filePath, password, vault, mode = 'replace' }) => {
  try {
    let sourceVault = vault;
    if (!sourceVault && filePath) {
      const raw = fs.readFileSync(filePath, 'utf8');
      sourceVault = await decryptObject(raw, password);
    }
    if (!sourceVault) return { ok: false, error: 'No valid vault data found to restore.' };

    let finalVault = sourceVault;

    if (mode === 'merge' && fs.existsSync(vaultFile)) {
      try {
        const existingRaw = fs.readFileSync(vaultFile, 'utf8');
        const existing = await decryptObject(existingRaw, password);

        // Smart merge collections
        const existingHKeys = new Set((existing.holdings || []).map(h => `${h.type}_${h.symbol || h.name}_${h.ownerHint || ''}`));
        const newHoldings = (sourceVault.holdings || []).filter(h => !existingHKeys.has(`${h.type}_${h.symbol || h.name}_${h.ownerHint || ''}`));

        const existingTKeys = new Set((existing.transactions || []).map(t => `${t.date}_${t.type}_${t.symbol || t.name}_${t.amount}`));
        const newTx = (sourceVault.transactions || []).filter(t => !existingTKeys.has(`${t.date}_${t.type}_${t.symbol || t.name}_${t.amount}`));

        const existingFamilyNames = new Set((existing.family || []).map(f => (f.name || '').toLowerCase()));
        const newFamily = (sourceVault.family || []).filter(f => !existingFamilyNames.has((f.name || '').toLowerCase()));

        finalVault = {
          ...existing,
          family: [...(existing.family || []), ...newFamily],
          holdings: [...(existing.holdings || []), ...newHoldings],
          transactions: [...(existing.transactions || []), ...newTx],
          liabilities: [...(existing.liabilities || []), ...(sourceVault.liabilities || [])],
          settings: { ...(existing.settings || {}), ...(sourceVault.settings || {}) }
        };
      } catch {
        // If decryption of existing failed, fallback to full replacement
        finalVault = sourceVault;
      }
    }

    await writeVault(password, finalVault);
    return { ok: true, vault: finalVault };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Market Data with Backoff, Header Fallback & Batching ───────

const YF_HEADER_SETS = [
  {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://finance.yahoo.com',
    'Referer': 'https://finance.yahoo.com/',
  },
  {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Accept': '*/*',
    'Accept-Language': 'en-US,en;q=0.8',
  },
  {
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  }
];

async function fetchYahoo(endpointPath, maxRetries = 3) {
  const hosts = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];
  let lastErr = null;

  for (const host of hosts) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const headers = YF_HEADER_SETS[attempt % YF_HEADER_SETS.length];
      try {
        const res = await fetch(`${host}${endpointPath}`, { headers });
        if (res.ok) {
          return await res.json();
        }
        if ([429, 500, 502, 503, 504].includes(res.status)) {
          lastErr = new Error(`HTTP ${res.status} from ${host}`);
        } else {
          lastErr = new Error(`HTTP ${res.status}`);
          break; // Try next host for non-transient status
        }
      } catch (e) {
        lastErr = e;
      }
      const delay = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 250);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error('Yahoo Finance request failed after retries and fallbacks');
}

// Yahoo Finance symbol search – market: 'IN' | 'US' | 'ALL'
ipcMain.handle('market:search', async (_, { query, market = 'ALL' }) => {
  try {
    if (!query || query.length < 2) return { ok: true, results: [] };
    const pathUrl = `/v1/finance/search?q=${encodeURIComponent(query)}&lang=en-US&region=IN&quotesCount=15&newsCount=0&listsCount=0`;
    const body = await fetchYahoo(pathUrl, 2);
    let quotes = (body?.quotes || []).filter(q => !q.quoteType || ['EQUITY', 'MUTUALFUND', 'ETF', 'BOND', 'CORP', 'OTHER'].includes(q.quoteType));
    if (market === 'IN') {
      const inOnly = quotes.filter(q => q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO'));
      if (inOnly.length > 0) quotes = inOnly;
    } else if (market === 'US') {
      quotes = quotes.filter(q => !q.symbol?.includes('.'));
    }
    const results = quotes.slice(0, 10).map(q => ({
      symbol:   q.symbol,
      name:     q.longname || q.shortname || q.symbol,
      exchange: q.exchDisp || q.exchange || '',
      type:     q.quoteType === 'MUTUALFUND' ? 'Mutual Fund' : q.quoteType === 'ETF' ? 'ETF' : (q.quoteType === 'BOND' || q.quoteType === 'CORP') ? 'Bond' : 'Stock',
      currency: q.currency || (q.symbol?.endsWith('.NS') || q.symbol?.endsWith('.BO') ? 'INR' : 'USD'),
    }));
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message, results: [] };
  }
});

// Single quote with retry & fallback
async function fetchStockQuote(symbol) {
  if (!symbol) throw new Error('No symbol provided');
  const pathUrl = `/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const body = await fetchYahoo(pathUrl, 3);
  const meta = body?.chart?.result?.[0]?.meta;
  if (!meta) throw new Error(`No quote data returned for ${symbol}`);
  const price = meta.regularMarketPrice ?? meta.previousClose ?? null;
  const prevClose = meta.previousClose ?? null;
  const currency = meta.currency || (symbol.endsWith('.NS') || symbol.endsWith('.BO') ? 'INR' : 'USD');
  return {
    price,
    currency,
    prevClose,
    change: (price != null && prevClose != null) ? +(price - prevClose).toFixed(4) : null,
    changePct: (price != null && prevClose != null && prevClose > 0) ? +((price - prevClose) / prevClose * 100).toFixed(2) : null,
    marketState: meta.marketState || 'UNKNOWN',
    symbol,
    name: meta.longName || meta.shortName || symbol,
  };
}

// Yahoo Finance real-time quote
ipcMain.handle('market:quote', async (_, { symbol }) => {
  try {
    const q = await fetchStockQuote(symbol);
    return { ok: true, ...q };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// MFAPI (India) – search funds by name
ipcMain.handle('market:mfSearch', async (_, { query }) => {
  try {
    if (!query || query.length < 3) return { ok: true, results: [] };
    const url = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) throw new Error(`MFAPI search HTTP ${res.status}`);
    const body = await res.json();
    const results = (Array.isArray(body) ? body : []).slice(0, 12).map(f => ({
      schemeCode: String(f.schemeCode),
      name:       f.schemeName,
      type:       'Mutual Fund',
      currency:   'INR',
    }));
    return { ok: true, results };
  } catch (e) {
    return { ok: false, error: e.message, results: [] };
  }
});

// MFAPI (India) – latest NAV for a scheme
async function fetchMFNav(schemeCode) {
  if (!schemeCode) throw new Error('No scheme code');
  const url = `https://api.mfapi.in/mf/${encodeURIComponent(schemeCode)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`MFAPI nav HTTP ${res.status}`);
  const body = await res.json();
  const latest = body?.data?.[0];
  if (!latest?.nav) throw new Error(`NAV not available for ${schemeCode}`);
  return {
    price:      parseFloat(latest.nav),
    nav:        parseFloat(latest.nav),
    date:       latest.date,
    name:       body?.meta?.scheme_name || '',
    isin:       body?.meta?.isin_div_payout_isin_growth || body?.meta?.isin_div_reinvestment || '',
    schemeCode: String(schemeCode),
    currency:   'INR',
  };
}

ipcMain.handle('market:mfNav', async (_, { schemeCode }) => {
  try {
    const q = await fetchMFNav(schemeCode);
    return { ok: true, ...q };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// Batch quote retrieval channel (market:batchQuotes)
// items: Array of { symbol?, schemeCode?, type? }
ipcMain.handle('market:batchQuotes', async (_, { items = [] }) => {
  try {
    if (!Array.isArray(items) || items.length === 0) {
      return { ok: true, quotes: {} };
    }

    const quotes = {};
    const concurrency = 6;
    const queue = [...items];

    // Worker pool to fetch with throttled concurrency
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) continue;

        const isMF = item.type === 'Mutual Fund' || (item.schemeCode && !item.symbol);
        const key = isMF ? String(item.schemeCode || item.symbol) : String(item.symbol || item.schemeCode);

        if (!key || quotes[key]) continue;

        try {
          if (isMF) {
            const data = await fetchMFNav(key);
            quotes[key] = { ok: true, ...data };
          } else {
            const data = await fetchStockQuote(key);
            quotes[key] = { ok: true, ...data };
          }
        } catch (err) {
          quotes[key] = { ok: false, error: err.message };
        }
      }
    });

    await Promise.all(workers);
    return { ok: true, quotes };
  } catch (e) {
    return { ok: false, error: e.message, quotes: {} };
  }
});

// Live exchange rates relative to INR (market:getRates)
ipcMain.handle('market:getRates', async () => {
  const fallbackRates = { INR: 1, USD: 86.8, EUR: 92.5, GBP: 110.2, AED: 23.6, SGD: 64.8 };
  try {
    const pairs = [
      { code: 'USD', sym: 'USDINR=X' },
      { code: 'EUR', sym: 'EURINR=X' },
      { code: 'GBP', sym: 'GBPINR=X' },
      { code: 'AED', sym: 'AEDINR=X' },
      { code: 'SGD', sym: 'SGDINR=X' },
    ];
    const rates = { INR: 1 };
    await Promise.allSettled(
      pairs.map(async p => {
        try {
          const q = await fetchStockQuote(p.sym);
          if (q.price && Number.isFinite(q.price)) {
            rates[p.code] = q.price;
          } else {
            rates[p.code] = fallbackRates[p.code];
          }
        } catch {
          rates[p.code] = fallbackRates[p.code];
        }
      })
    );
    return { ok: true, rates };
  } catch {
    return { ok: true, rates: fallbackRates };
  }
});


// ── App Window ───────────────────────────────────────────────

function getAppIcon() {
  const possiblePaths = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'build', 'icon.ico'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'logo.png'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../logo.png'),
    path.join(app.getAppPath(), 'build', 'icon.ico'),
    path.join(app.getAppPath(), 'logo.png')
  ];
  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(p)) {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img;
        return p;
      }
    } catch (e) {}
  }
  return undefined;
}

function createWindow() {
  const appIcon = getAppIcon();
  const win = new BrowserWindow({
    title: 'Baba Wealth',
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#05070d',
    icon: appIcon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      allowRunningInsecureContent: false
    }
  });
  win.setMenuBarVisibility(false);
  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
  } else {
    const indexPath = path.join(app.getAppPath(), 'dist', 'index.html');
    win.loadFile(indexPath);
  }
}
app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

