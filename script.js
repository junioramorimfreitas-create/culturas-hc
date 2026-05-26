/* =========================================================
   Resumo de Culturas - HCFMUSP
   Parser reescrito para aceitar:
   1) laudo antigo com cabeçalho "CULTURA ... - MATERIAL";
   2) laudo novo em "HISTÓRICO DE EXAMES", copiado/colado do PDF;
   3) antibiograma CLSI antigo em colunas com S/R/I/D;
   4) antibiograma BrCAST com texto: Sensível Dose Padrão,
      Sensível Aumentando a exposição, Resistente, etc.
   ========================================================= */

/* ===============================
   UTILITÁRIOS DE TEXTO
   =============================== */

function removeDiacritics(str) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizePlain(str) {
  return removeDiacritics(str).toLowerCase().replace(/\s+/g, " ").trim();
}

function toTitleCase(str) {
  const keepUpper = new Set(["HL", "KPC", "NDM", "VIM", "IMP", "OXA"]);
  return String(str || "")
    .toLowerCase()
    .replace(/(^|[\s/+\-])([^\s/+\-]+)/g, (full, sep, word) => {
      const raw = word.toUpperCase();
      if (keepUpper.has(raw)) return sep + raw;
      return sep + word.charAt(0).toUpperCase() + word.slice(1);
    })
    .replace(/\bhl\b/gi, "HL")
    .replace(/\btrimethoprim\b/gi, "Trimethoprim");
}

function normalizeMaterial(str) {
  if (!str) return "";
  return String(str)
    .split(",")[0]
    .replace(/\s*-\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

function ddmm(dateStr) {
  if (!dateStr) return "";
  const m = String(dateStr).match(/(\d{2})\/(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : "";
}

function canonicalKey(str) {
  return normalizePlain(str)
    .replace(/\(\s*hl\s*\)/gi, " hl")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function uniqPush(arr, value) {
  if (!value) return;
  if (!arr.some((x) => canonicalKey(x) === canonicalKey(value))) arr.push(value);
}

function getCultureType(examType) {
  const s = normalizePlain(examType || "");
  if (s.includes("anaerob")) return "anaeróbia";
  if (s.includes("aerob")) return "aeróbia";
  if (s.includes("fung")) return "fungos";
  if (s.includes("micobact")) return "micobactérias";
  return "";
}

/* ===============================
   ANTIBIÓTICOS / ANTIFÚNGICOS
   =============================== */

const ANTIMICROBIALS = [
  "CEFTAZIDIMA/AVIBACTAM",
  "PIPERACILINA/TAZOBACTAM",
  "AMPICILINA SULBACTAM",
  "SULFA + TRIMETHOPRIM",
  "CEFUROXIMA PARENTERAL",
  "CEFUROXIMA ORAL",
  "ESTREPTOMICINA (HL)",
  "GENTAMICINA (HL)",
  "CEFTRIAXONE",
  "CEFTRIAXONA",
  "CLINDAMICINA",
  "CLORANFENICOL",
  "CIPROFLOXACINA",
  "LEVOFLOXACINA",
  "TEICOPLANINA",
  "TIGECICLINA",
  "VANCOMICINA",
  "DAPTOMICINA",
  "ERITROMICINA",
  "RIFAMPICINA",
  "TETRACICLINA",
  "NITROFURANTOINA",
  "CEFTAZIDIMA",
  "CEFEPIME",
  "AZTREONAM",
  "ERTAPENEM",
  "MEROPENEM",
  "AMICACINA",
  "GENTAMICINA",
  "AMPICILINA",
  "OXACILINA",
  "PENICILINA",
  "LINEZOLIDA",
  "COLISTINA",
  "FLUCONAZOL",
  "MICAFUNGINA",
  "ANIDULAFUNGINA",
  "VORICONAZOL",
  "POLIMIXINA B",
  "CEFALEXINA",
];

const ANTIMICROBIALS_SORTED = [...ANTIMICROBIALS].sort((a, b) => b.length - a.length);

function normalizeAntimicrobialName(name) {
  let s = String(name || "").trim();
  s = s.replace(/CEFTRIAXONA/i, "CEFTRIAXONE");
  s = s.replace(/AMPICILINA\/SULBACTAM/i, "AMPICILINA SULBACTAM");
  s = s.replace(/\s+/g, " ");
  return toTitleCase(s);
}

function antimicrobialRegexSource(ab) {
  return removeDiacritics(ab)
    .toUpperCase()
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+")
    .replace(/\//g, "\\s*\/\\s*");
}

function findAllAntimicrobialsInLine(line, startAt = 0) {
  const original = String(line || "");
  const upper = removeDiacritics(original).toUpperCase();
  const matches = [];

  for (const ab of ANTIMICROBIALS_SORTED) {
    const re = new RegExp(`(^|\\s)(${antimicrobialRegexSource(ab)})(?=\\s|$|[<>=#*])`, "gi");
    let m;
    while ((m = re.exec(upper)) !== null) {
      const idx = m.index + (m[1] ? m[1].length : 0);
      if (idx < startAt) continue;
      matches.push({ index: idx, name: ab, end: idx + m[2].length });
    }
  }

  // Remove sobreposições. Como ANTIMICROBIALS_SORTED está por tamanho,
  // preservamos o nome mais longo quando há conflito.
  matches.sort((a, b) => a.index - b.index || b.name.length - a.name.length);
  const kept = [];
  for (const m of matches) {
    const overlaps = kept.some((k) => !(m.end <= k.index || m.index >= k.end));
    if (!overlaps) kept.push(m);
  }
  return kept.sort((a, b) => a.index - b.index);
}

function findAntimicrobialInLine(line, startAt = 0) {
  const all = findAllAntimicrobialsInLine(line, startAt);
  return all.length ? all[0] : null;
}

/* ===============================
   CONTROLE DOS BOTÕES DE FILTRO
   =============================== */

const selectedAntibiotics = new Set();
let lastFormattedText = "";

const antibioticButtons = document.querySelectorAll(".antibiotic-btn[data-antibiotico]");
const antibioticsWithButtons = new Set();

antibioticButtons.forEach((btn) => {
  const label = (btn.dataset.antibiotico || "").trim();
  if (label) antibioticsWithButtons.add(canonicalKey(label));
});

function applyAntibioticFilter() {
  const outputEl = document.getElementById("output");
  if (!outputEl) return;
  outputEl.value = filterFormattedByAntibiotics(lastFormattedText, selectedAntibiotics);
}

function setAllAntibiotics(selected) {
  selectedAntibiotics.clear();

  antibioticButtons.forEach((btn) => {
    const label = (btn.dataset.antibiotico || "").trim();
    if (!label) return;

    const key = canonicalKey(label);
    if (selected) {
      selectedAntibiotics.add(key);
      btn.classList.add("selected");
    } else {
      btn.classList.remove("selected");
    }
  });

  applyAntibioticFilter();
}

antibioticButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const label = (btn.dataset.antibiotico || "").trim();
    if (!label) return;

    const key = canonicalKey(label);
    if (selectedAntibiotics.has(key)) {
      selectedAntibiotics.delete(key);
      btn.classList.remove("selected");
    } else {
      selectedAntibiotics.add(key);
      btn.classList.add("selected");
    }

    applyAntibioticFilter();
  });
});

document.getElementById("selectAllAntibiotics")?.addEventListener("click", () => setAllAntibiotics(true));
document.getElementById("deselectAllAntibiotics")?.addEventListener("click", () => setAllAntibiotics(false));

if (antibioticButtons.length > 0) setAllAntibiotics(true);

function filterFormattedByAntibiotics(text, selectedSet) {
  if (!selectedSet) return text || "";

  return String(text || "")
    .split("\n")
    .map((line) => {
      if (!/\((?:[^()]|\([^()]*\))*\b(?:R|S|I|D|Obs)\s*:/i.test(line)) return line;

      const placeholderHL = "__HL__";
      let working = line.replace(/\(\s*HL\s*\)/gi, placeholderHL);

      working = working.replace(/\(([^()]*)\)/g, (full, inner) => {
        if (!/\b(?:R|S|I|D|Obs)\s*:/i.test(inner)) return full;

        const blocks = inner.split("|").map((x) => x.trim()).filter(Boolean);
        const keptBlocks = [];

        for (const block of blocks) {
          const m = block.match(/^(R|S|I|D|Obs)\s*:\s*(.+)$/i);
          if (!m) {
            keptBlocks.push(block);
            continue;
          }

          const cls = m[1];
          const names = m[2].split(",").map((x) => x.trim()).filter(Boolean);
          const keptNames = names.filter((name) => {
            const key = canonicalKey(name.replace(placeholderHL, "HL"));
            if (!antibioticsWithButtons.has(key)) return true;
            return selectedSet.has(key);
          });

          if (keptNames.length) keptBlocks.push(`${cls}: ${keptNames.join(", ")}`);
        }

        return keptBlocks.length ? `(${keptBlocks.join(" | ")})` : "";
      });

      return working.replaceAll(placeholderHL, "(HL)").replace(/\s{2,}/g, " ").trimEnd();
    })
    .join("\n");
}

/* ===============================
   PARSER PRINCIPAL
   =============================== */

function makeEmptyCulture() {
  return {
    examType: "",
    material: "",
    collectionDate: null,
    collectionTime: null,
    resultDate: null,
    isPartial: false,
    methodText: "",
    orgs: [],
    resultSummary: null,
    parsingAntibiogram: false,
    headerPositions: [],
    resistanceNotes: [],
    detectionTime: null,
  };
}

function getOrgByNumber(culture, number) {
  const n = Number(number);
  if (!n || n < 1) return null;

  while (culture.orgs.length < n) {
    culture.orgs.push({
      number: culture.orgs.length + 1,
      name: `Organismo ${culture.orgs.length + 1}`,
      ufc: null,
      R: [],
      S: [],
      I: [],
      D: [],
      Obs: [],
    });
  }
  return culture.orgs[n - 1];
}

function addOrUpdateOrganism(culture, number, name) {
  const org = getOrgByNumber(culture, number);
  if (!org) return null;

  const cleanName = String(name || "").replace(/\s+/g, " ").trim();
  if (cleanName && !/^Organismo\s+\d+$/i.test(cleanName)) org.name = cleanName;
  return org;
}

function classifyAntimicrobialResult(segment, abName) {
  const s = normalizePlain(segment);

  if (/consultar\s+observa/.test(s)) return "Obs";
  if (/sensivel\s+dose\s+dependente/.test(s) || /\bsdd\b/.test(s)) return "D";
  if (/resistente/.test(s)) return "R";
  if (/intermediario/.test(s)) return "I";
  if (/sensivel/.test(s)) return "S";

  // CLSI: pega a última letra S/R/I/D após MIC ou isolada.
  const letterMatches = [...String(segment).matchAll(/(?:^|\s)([SRID])(?=\s|$)/gi)];
  if (letterMatches.length) return letterMatches[letterMatches.length - 1][1].toUpperCase();

  // Regra que já existia: colistina com * no laudo antigo era tratada como sensível.
  if (/colistina/i.test(abName) && /\*/.test(segment)) return "S";

  // # geralmente indica resultado pendente/aguardar final; não entra como S/R/I/D.
  return null;
}

function extractStatusTokensWithPositions(rawLine, searchStartIndex) {
  const tokens = [];
  const tail = rawLine.slice(searchStartIndex);

  // Palavras do BrCAST.
  const wordPatterns = [
    { re: /Consultar\s+observaç[aã]o/i, cls: "Obs" },
    { re: /Sens[ií]vel\s+Dose\s+Dependente/i, cls: "D" },
    { re: /Sens[ií]vel\s+Aumentando\s+a\s+exposiç[aã]o/i, cls: "S" },
    { re: /Sens[ií]vel\s+Dose\s+Padr[aã]o/i, cls: "S" },
    { re: /Resistente/i, cls: "R" },
    { re: /Intermedi[aá]rio/i, cls: "I" },
    { re: /Sens[ií]vel/i, cls: "S" },
  ];

  for (const p of wordPatterns) {
    const m = tail.match(p.re);
    if (m) tokens.push({ cls: p.cls, index: searchStartIndex + m.index });
  }

  const letterRe = /(?:^|\s)([SRID])(?=\s|$)/gi;
  let lm;
  while ((lm = letterRe.exec(tail)) !== null) {
    tokens.push({ cls: lm[1].toUpperCase(), index: searchStartIndex + lm.index + lm[0].search(/[SRID]/i) });
  }

  if (/\*/.test(tail)) {
    const idx = rawLine.indexOf("*", searchStartIndex);
    if (idx >= 0) tokens.push({ cls: "S", index: idx });
  }

  return tokens.sort((a, b) => a.index - b.index);
}

function chooseOrgIndexByPosition(culture, tokenIndex, fallbackOrgNumber) {
  if (culture.headerPositions && culture.headerPositions.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    culture.headerPositions.forEach((pos, idx) => {
      const dist = Math.abs(tokenIndex - pos);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return bestIdx + 1;
  }

  if (fallbackOrgNumber) return fallbackOrgNumber;
  if (culture.orgs.length === 1) return 1;
  return 1;
}

function parseHeaderPositions(line) {
  const raw = String(line || "");
  const trimmed = raw.trim();

  // Formato isolado: "1 2".
  let target = null;
  if (/^\d+(?:\s+\d+){0,7}$/.test(trimmed)) {
    target = raw;
  }

  // Formato comum no PDF: "ANTIBIOGRAMA 1 2".
  const mAtb = raw.match(/ANTIBIOGRAMA\s+((?:\d+\s*){1,8})/i);
  if (mAtb) target = raw.slice(mAtb.index + mAtb[0].indexOf(mAtb[1]));

  if (!target) return [];

  const positions = [];
  const re = /\d+/g;
  let m;
  while ((m = re.exec(target)) !== null) {
    // Se target é um slice, convertemos de volta para a posição da linha original.
    const base = target === raw ? 0 : raw.indexOf(target);
    positions.push(base + m.index);
  }
  return positions;
}

function assignTokenToOrganism(culture, token, tokenOrder, totalTokens, fallbackOrgNumber) {
  // 1) Quando há cabeçalho visual de colunas, usa a posição horizontal.
  if (culture.headerPositions && culture.headerPositions.length > 1) {
    return chooseOrgIndexByPosition(culture, token.index, fallbackOrgNumber);
  }

  // 2) Sem cabeçalho confiável, se há vários resultados na mesma linha e vários
  // microrganismos, assume ordem sequencial: 1º token -> org 1, 2º -> org 2...
  if (totalTokens > 1 && culture.orgs.length > 1) {
    return Math.min(tokenOrder + 1, culture.orgs.length);
  }

  // 3) Caso usual: linha pertence ao microrganismo atual.
  return fallbackOrgNumber || 1;
}

function parseAntimicrobialLine(rawLine, culture, fallbackOrgNumber = null) {
  const all = findAllAntimicrobialsInLine(rawLine);
  if (!all.length) return false;

  let parsedAny = false;

  for (let a = 0; a < all.length; a++) {
    const found = all[a];
    const next = all[a + 1];
    const abName = normalizeAntimicrobialName(found.name);
    const segmentEnd = next ? next.index : String(rawLine).length;
    const segment = String(rawLine).slice(found.index, segmentEnd);
    const afterNameIndex = found.index + found.name.length;
    let tokens = extractStatusTokensWithPositions(String(rawLine).slice(0, segmentEnd), afterNameIndex)
      .filter((t) => t.index >= afterNameIndex && t.index < segmentEnd);

    // Evita duplicação quando aparece "Sensível Dose Padrão" e alguma letra isolada em outro trecho.
    // Mantém todos os tokens legítimos, pois em múltiplos microrganismos pode haver 2+ resultados.
    if (!tokens.length) continue;

    tokens.forEach((token, idx) => {
      const orgNumber = assignTokenToOrganism(culture, token, idx, tokens.length, fallbackOrgNumber);
      const org = getOrgByNumber(culture, orgNumber);
      if (!org) return;

      if (token.cls === "Obs") uniqPush(org.Obs, abName);
      else if (["R", "S", "I", "D"].includes(token.cls)) uniqPush(org[token.cls], abName);
      parsedAny = true;
    });
  }

  return parsedAny;
}

function looksLikeFooter(line) {
  return /^(M[eé]dicos Respons[aá]veis|Os resultados dos exames laboratoriais|Consulte Manual|Material Biol[oó]gico entregue|DRA\.|DR\s|PROF|CRM\b|Espaco entre os memos)/i.test(line);
}

function finalizeCulture(culture, results) {
  if (!culture) return;

  // Remove organismos fictícios sem nome real e sem antibiograma.
  culture.orgs = culture.orgs.filter((org) => {
    const hasRealName = org.name && !/^Organismo\s+\d+$/i.test(org.name);
    const hasAtb = org.R.length || org.S.length || org.I.length || org.D.length || org.Obs.length;
    return hasRealName || hasAtb;
  });

  const date = ddmm(culture.collectionDate || culture.resultDate);
  const rawMaterial = culture.material || "Material não informado";
  let materialLabel = normalizeMaterial(rawMaterial) || "Material não informado";

  const cultureType = getCultureType(culture.examType);
  if (cultureType && !normalizePlain(materialLabel).includes(cultureType)) {
    materialLabel += " - " + cultureType;
  }

  const isBlood = /sangue|bactec/i.test(`${culture.material} ${culture.examType} ${culture.methodText}`);

  if (culture.orgs.length > 0) {
    const orgSegments = culture.orgs.map((org) => {
      let seg = org.name;
      if (org.ufc) seg += ` (${org.ufc})`;

      const parts = [];
      if (org.R.length) parts.push(`R: ${org.R.join(", ")}`);
      if (org.S.length) parts.push(`S: ${org.S.join(", ")}`);
      if (org.I.length) parts.push(`I: ${org.I.join(", ")}`);
      if (org.D.length) parts.push(`D: ${org.D.join(", ")}`);
      if (org.Obs.length) parts.push(`Obs: ${org.Obs.join(", ")}`);

      if (parts.length) seg += ` (${parts.join(" | ")})`;
      return seg;
    });

    let line = date ? `(${date}) ` : "";
    line += `${materialLabel}: ${orgSegments.join(" + ")}`;

    if (culture.resistanceNotes.length) line += ` [${culture.resistanceNotes.join("; ")}]`;
    if (isBlood && culture.detectionTime) line += ` (Tempo de detecção: ${culture.detectionTime})`;
    if (culture.isPartial) line += " — parcial";

    results.push(line);
    return;
  }

  if (culture.resultSummary) {
    let line = date ? `(${date}) ` : "";
    line += `${materialLabel}: ${culture.resultSummary}`;
    if (culture.isPartial) line += " — parcial";
    results.push(line);
  }
}


function preparePastedText(text) {
  let t = String(text || "").replace(/\u00a0/g, " ");

  // Quando o texto vem de Ctrl+C/Ctrl+V do PDF, às vezes blocos inteiros ficam
  // em uma linha só. Estes marcadores recriam quebras de linha úteis para o parser.
  const markers = [
    "Coletado em:",
    "Liberado em:",
    "Resultado PARCIAL",
    "Resultado",
    "ANTIBIOGRAMA",
    "Microrganismos",
    "Antibiogramas",
    "Antimicrobiano",
    "Observações:",
    "Obs:",
    "Legenda",
    "Espaco entre os memos",
    "Material Biológico entregue",
    "Consulte Manual",
    "Médicos Responsáveis",
  ];

  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s+(${escaped})`, "gi"), "\n$&");
  }

  // Quebra antes de "1 - Nome do microrganismo", sem mexer em MICs como >= 32 R.
  t = t.replace(/\s+(?=\d+\s*-\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ]+(?:\s+[a-zÀ-ÿ(]|\s+[A-Z][a-zÀ-ÿ]))/g, "\n");

  return t;
}

function parseCultures(text) {
  const lines = preparePastedText(text).split(/\r?\n/);
  const results = [];
  let currentCulture = null;
  let lastOrgNumber = null;

  function ensureCulture() {
    if (!currentCulture) currentCulture = makeEmptyCulture();
    return currentCulture;
  }

  function finishCurrent() {
    finalizeCulture(currentCulture, results);
    currentCulture = null;
    lastOrgNumber = null;
  }

  for (let rawLine of lines) {
    if (!rawLine) continue;
    const line = rawLine.trim();
    if (!line) continue;

    if (looksLikeFooter(line)) continue;

    // Novo exame dentro de um bloco colado com vários laudos.
    const mCollection = line.match(/^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/i);
    if (mCollection) {
      if (currentCulture && (currentCulture.orgs.length || currentCulture.resultSummary || currentCulture.collectionDate)) {
        finishCurrent();
      }
      const c = ensureCulture();
      c.collectionDate = mCollection[1];
      c.collectionTime = mCollection[2] || null;
      continue;
    }

    const mLiberadoSameLine = line.match(/^Liberado em:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}:\d{2}))?/i);
    if (mLiberadoSameLine) {
      const c = ensureCulture();
      c.resultDate = mLiberadoSameLine[1];
      continue;
    }

    if (/^Resultado\s+PARCIAL/i.test(line)) {
      ensureCulture().isPartial = true;
      continue;
    }

    // Cabeçalho antigo: CULTURA AERÓBIA - URINA...
    const mCultureHeader = line.match(/^(CULTURA.+?)\s+-\s*(.+?)(?:\s*[,;].*)?$/i);
    if (mCultureHeader && line.includes(" - ")) {
      if (currentCulture && (currentCulture.orgs.length || currentCulture.resultSummary)) finishCurrent();
      const c = ensureCulture();
      c.examType = mCultureHeader[1].trim();
      c.material = mCultureHeader[2].trim();
      c.parsingAntibiogram = false;
      continue;
    }

    // Resultado antigo de cultura positiva/negativa.
    if (/^CULTURA\s+/i.test(line) && /\b(Positiva|Negativa)\b/i.test(line)) {
      const c = ensureCulture();
      if (/Parcial/i.test(line) && /Negativa/i.test(line)) c.resultSummary = "parcial negativa";
      else c.resultSummary = /\bPositiva\b/i.test(line) ? "positiva" : "negativa";
      continue;
    }

    // Captura método, porque Bactec ajuda a inferir que é hemocultura, mas não inventa material.
    if (/Semeadura|manual\/Vitek|Maldi/i.test(line)) {
      ensureCulture().methodText += " " + line;
      continue;
    }

    // Cabeçalho de colunas do antibiograma: "1 2 3".
    const headerPositions = parseHeaderPositions(rawLine);
    if (headerPositions.length) {
      ensureCulture().headerPositions = headerPositions;
      continue;
    }

    if (/^ANTIBIOGRAMA/i.test(line) || /^Antibiogramas$/i.test(line)) {
      ensureCulture().parsingAntibiogram = true;
      continue;
    }

    if (/^Microrganismos$/i.test(line)) {
      ensureCulture();
      continue;
    }

    if (/^Antimicrobiano\s+Classifica/i.test(line)) {
      ensureCulture().parsingAntibiogram = true;
      continue;
    }

    if (/^Legenda/i.test(line)) {
      // Alguns PDFs colocam o primeiro antibiótico na mesma linha da palavra "Legenda".
      // Ex.: "Legenda CEFEPIME >= 32 R" ou "Legenda GENTAMICINA (HL) R".
      if (currentCulture && parseAntimicrobialLine(rawLine, currentCulture, lastOrgNumber)) continue;
      continue;
    }

    if (/^Observaç[oõ]es?:/i.test(line) || /^Obs:/i.test(line)) {
      // Não finaliza a cultura; só deixa de interpretar texto explicativo como antibiograma.
      continue;
    }

    // Marcadores úteis de resistência em texto livre.
    const kpc = line.match(/\b(KPC|NDM|VIM|IMP|OXA[- ]?48)\s*:\s*POSITIVO\b/i);
    if (kpc && currentCulture) {
      uniqPush(currentCulture.resistanceNotes, `${kpc[1].toUpperCase().replace(/\s+/g, "")}: positivo`);
      continue;
    }

    // Tempo de detecção de hemocultura.
    if (/^T\.\s*DETEC/i.test(line) && currentCulture) {
      const mDet = line.match(/(\d+)\s*Dias?.*?(\d+)\s*Horas?.*?(\d+)\s*Minutos?/i);
      if (mDet) {
        const d = parseInt(mDet[1], 10) || 0;
        const h = parseInt(mDet[2], 10) || 0;
        const min = parseInt(mDet[3], 10) || 0;
        currentCulture.detectionTime = `${d ? d + "d " : ""}${h ? h + "h " : ""}${min}min`.trim();
      }
      continue;
    }

    // Linha de microrganismo. Pode vir sozinha ou com o primeiro antibiótico na mesma linha.
    const mOrgStart = line.match(/^(\d+)\s*-\s*(.+)$/);
    if (mOrgStart) {
      const c = ensureCulture();
      const orgNumber = parseInt(mOrgStart[1], 10);
      if (orgNumber < 1 || orgNumber > 20) continue;
      let rest = mOrgStart[2];
      const foundAb = findAntimicrobialInLine(rest);

      if (foundAb) {
        const orgName = rest.slice(0, foundAb.index).trim();
        addOrUpdateOrganism(c, orgNumber, orgName);
        lastOrgNumber = orgNumber;

        // A mesma linha pode conter o primeiro antibiótico e, em colagens ruins,
        // vários outros antimicrobianos em sequência. Usamos rawLine para preservar
        // as posições visuais das colunas quando o PDF mantém alinhamento.
        parseAntimicrobialLine(rawLine, c, orgNumber);
      } else {
        addOrUpdateOrganism(c, orgNumber, rest);
        lastOrgNumber = orgNumber;
      }
      continue;
    }

    // UFC/mL para o último microrganismo lido.
    if (/UFC\/mL/i.test(line) && currentCulture && lastOrgNumber) {
      const org = getOrgByNumber(currentCulture, lastOrgNumber);
      const uMatch = line.match(/\(?\s*([^()]*UFC\/mL[^()]*)\)?/i);
      if (org && uMatch) org.ufc = uMatch[1].trim();
      continue;
    }

    // Linha de antibiótico/antifúngico.
    if (currentCulture && parseAntimicrobialLine(rawLine, currentCulture, lastOrgNumber)) {
      continue;
    }
  }

  finishCurrent();

  return results.join("\n");
}

/* ===============================
   BOTÕES DA INTERFACE
   =============================== */

document.getElementById("processBtn")?.addEventListener("click", function () {
  const raw = document.getElementById("input")?.value || "";
  const formatted = parseCultures(raw);
  lastFormattedText = formatted;
  document.getElementById("output").value = filterFormattedByAntibiotics(formatted, selectedAntibiotics);
});

document.getElementById("copyBtn")?.addEventListener("click", async () => {
  const output = document.getElementById("output");
  if (!output) return;

  try {
    await navigator.clipboard.writeText(output.value);
    showToast("Copiado!");
  } catch (err) {
    showToast("Erro ao copiar");
  }
});

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}
