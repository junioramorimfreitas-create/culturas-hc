/* =========================================================
   Resumo de Culturas - HCFMUSP
   Versão enxuta: parser apenas para o NOVO formato de laudo
   "HISTÓRICO DE EXAMES" copiado/colado em textarea.
   ========================================================= */

/* ===============================
   UTILITÁRIOS
   =============================== */

function removeDiacritics(str) {
  return String(str || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizePlain(str) {
  return removeDiacritics(str).toLowerCase().replace(/\s+/g, " ").trim();
}

function canonicalKey(str) {
  return normalizePlain(str)
    .replace(/\(\s*hl\s*\)/gi, " hl")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function ddmm(dateStr) {
  const m = String(dateStr || "").match(/(\d{2})\/(\d{2})/);
  return m ? `${m[1]}/${m[2]}` : "";
}

function toTitleCase(str) {
  const keepUpper = new Set(["HL", "KPC", "NDM", "VIM", "IMP", "OXA"]);
  return String(str || "")
    .toLowerCase()
    .replace(/(^|[\s/+\-])([^\s/+\-]+)/g, (full, sep, word) => {
      const upper = word.toUpperCase();
      if (keepUpper.has(upper)) return sep + upper;
      return sep + word.charAt(0).toUpperCase() + word.slice(1);
    })
    .replace(/\btrimethoprim\b/gi, "Trimethoprim")
    .replace(/\bhl\b/gi, "HL");
}

function uniqPush(arr, value) {
  if (!value) return;
  const key = canonicalKey(value);
  if (!arr.some((x) => canonicalKey(x) === key)) arr.push(value);
}

/* ===============================
   ANTIMICROBIANOS RECONHECIDOS
   =============================== */

const ANTIMICROBIALS = [
  "CEFTAZIDIMA/AVIBACTAM",
  "PIPERACILINA/TAZOBACTAM",
  "AMPICILINA SULBACTAM",
  "AMPICILINA/SULBACTAM",
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
  s = s.replace(/AMPICILINA\s*\/\s*SULBACTAM/i, "AMPICILINA SULBACTAM");
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

function findAntimicrobials(line) {
  const original = String(line || "");
  const upper = removeDiacritics(original).toUpperCase();
  const matches = [];

  for (const ab of ANTIMICROBIALS_SORTED) {
    const re = new RegExp(`(^|\\s)(${antimicrobialRegexSource(ab)})(?=\\s|$|[<>=#*])`, "gi");
    let m;
    while ((m = re.exec(upper)) !== null) {
      const index = m.index + (m[1] ? m[1].length : 0);
      const end = index + m[2].length;
      matches.push({ index, end, raw: original.slice(index, end), name: ab });
    }
  }

  // Mantém o match mais longo quando houver sobreposição.
  matches.sort((a, b) => a.index - b.index || b.end - b.index - (a.end - a.index));
  const kept = [];
  for (const m of matches) {
    if (!kept.some((k) => !(m.end <= k.index || m.index >= k.end))) kept.push(m);
  }
  return kept.sort((a, b) => a.index - b.index);
}

/* ===============================
   FILTRO DOS BOTÕES
   =============================== */

const selectedAntibiotics = new Set();
let lastFormattedText = "";

const antibioticButtons = document.querySelectorAll(".antibiotic-btn[data-antibiotico]");
const antibioticsWithButtons = new Set();

antibioticButtons.forEach((btn) => {
  const label = (btn.dataset.antibiotico || "").trim();
  if (label) antibioticsWithButtons.add(canonicalKey(label));
});

function filterFormattedByAntibiotics(text, selectedSet) {
  if (!selectedSet) return text || "";

  return String(text || "")
    .split("\n")
    .map((line) => {
      if (!/\((?:[^()]|\([^()]*\))*\b(?:R|S|I|D|Obs)\s*:/i.test(line)) return line;

      const hl = "__HL__";
      let working = line.replace(/\(\s*HL\s*\)/gi, hl);

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
            const key = canonicalKey(name.replace(hl, "HL"));
            if (!antibioticsWithButtons.has(key)) return true;
            return selectedSet.has(key);
          });

          if (keptNames.length) keptBlocks.push(`${cls}: ${keptNames.join(", ")}`);
        }

        return keptBlocks.length ? `(${keptBlocks.join(" | ")})` : "";
      });

      return working.replaceAll(hl, "(HL)").replace(/\s{2,}/g, " ").trimEnd();
    })
    .join("\n");
}

function applyAntibioticFilter() {
  const outputEl = document.getElementById("output");
  if (outputEl) outputEl.value = filterFormattedByAntibiotics(lastFormattedText, selectedAntibiotics);
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
if (antibioticButtons.length) setAllAntibiotics(true);

/* ===============================
   PARSER DO NOVO LAUDO
   =============================== */

function newOrg(number, name) {
  return {
    number,
    name: String(name || `Organismo ${number}`).replace(/\s+/g, " ").trim(),
    R: [],
    S: [],
    I: [],
    D: [],
    Obs: [],
  };
}

function newExam() {
  return {
    collectionDate: null,
    isPartial: false,
    material: "Material não informado",
    orgs: [],
    resistanceNotes: [],
  };
}

function getOrg(exam, number) {
  const n = Number(number) || 1;
  let org = exam.orgs.find((x) => x.number === n);
  if (!org) {
    org = newOrg(n, `Organismo ${n}`);
    exam.orgs.push(org);
    exam.orgs.sort((a, b) => a.number - b.number);
  }
  return org;
}

function setOrgName(exam, number, name) {
  const org = getOrg(exam, number);
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  if (clean) org.name = clean;
  return org;
}

function classifySegment(segment, abName) {
  const s = normalizePlain(segment);

  if (/consultar\s+observa/.test(s)) return ["Obs"];
  if (/sensivel\s+dose\s+dependente/.test(s) || /\bsdd\b/.test(s)) return ["D"];
  if (/sensivel\s+aumentando\s+a\s+exposicao/.test(s)) return ["S"];
  if (/sensivel\s+dose\s+padrao/.test(s)) return ["S"];
  if (/resistente/.test(s)) return ["R"];
  if (/intermediario/.test(s)) return ["I"];
  if (/sensivel/.test(s)) return ["S"];

  const tokens = [];
  const re = /(?:^|\s)([SRID])(?=\s|$)/gi;
  let m;
  while ((m = re.exec(segment)) !== null) tokens.push(m[1].toUpperCase());

  if (tokens.length) return tokens;

  if (/colistina/i.test(abName) && /\*/.test(segment)) return ["S"];
  return [];
}

function likelyOrgForAntimicrobial(exam, abName, fallbackOrgNumber) {
  const key = canonicalKey(abName);

  const buckets = [
    {
      org: /enterococcus|faecium|faecalis/i,
      abs: ["ampicilina", "estreptomicinahl", "gentamicinahl", "levofloxacina", "linezolida", "teicoplanina", "tigeciclina", "vancomicina", "daptomicina"],
    },
    {
      org: /klebsiella|acinetobacter|pseudomonas|escherichia|serratia|enterobacter|proteus|baumannii|pneumoniae complex/i,
      abs: ["amicacina", "aztreonam", "cefepime", "ceftazidima", "ceftazidimaavibactam", "ceftriaxone", "cefuroximaoral", "cefuroximaparenteral", "ciprofloxacina", "colistina", "ertapenem", "gentamicina", "meropenem", "piperacilinatazobactam", "tigeciclina", "ampicilinasulbactam"],
    },
    {
      org: /candida|glabrata|nakaseomyces/i,
      abs: ["fluconazol", "micafungina", "anidulafungina", "voriconazol"],
    },
    {
      org: /staphylococcus|aureus|epidermidis|coagulase/i,
      abs: ["clindamicina", "daptomicina", "eritromicina", "gentamicina", "levofloxacina", "linezolida", "oxacilina", "penicilina", "rifampicina", "sulfatrimethoprim", "teicoplanina", "tigeciclina", "vancomicina"],
    },
    {
      org: /streptococcus|pneumoniae/i,
      abs: ["ceftriaxone", "clindamicina", "cloranfenicol", "eritromicina", "levofloxacina", "penicilina", "sulfatrimethoprim", "tetraciclina", "vancomicina"],
    },
  ];

  for (const bucket of buckets) {
    if (!bucket.abs.includes(key)) continue;
    const candidates = exam.orgs.filter((org) => bucket.org.test(org.name));
    if (candidates.length === 1) return candidates[0].number;
  }

  return fallbackOrgNumber || (exam.orgs[0]?.number || 1);
}


function bucketOrgNumbersForAntimicrobial(exam, abName) {
  const key = canonicalKey(abName);
  const buckets = [
    {
      org: /enterococcus|faecium|faecalis/i,
      abs: ["ampicilina", "estreptomicinahl", "gentamicinahl", "levofloxacina", "linezolida", "teicoplanina", "tigeciclina", "vancomicina", "daptomicina"],
    },
    {
      org: /klebsiella|acinetobacter|pseudomonas|escherichia|serratia|enterobacter|proteus|baumannii|pneumoniae complex/i,
      abs: ["amicacina", "aztreonam", "cefepime", "ceftazidima", "ceftazidimaavibactam", "ceftriaxone", "cefuroximaoral", "cefuroximaparenteral", "ciprofloxacina", "colistina", "ertapenem", "gentamicina", "meropenem", "piperacilinatazobactam", "tigeciclina", "ampicilinasulbactam"],
    },
    {
      org: /candida|glabrata|nakaseomyces/i,
      abs: ["fluconazol", "micafungina", "anidulafungina", "voriconazol"],
    },
    {
      org: /staphylococcus|aureus|epidermidis|coagulase/i,
      abs: ["clindamicina", "daptomicina", "eritromicina", "gentamicina", "levofloxacina", "linezolida", "oxacilina", "penicilina", "rifampicina", "sulfatrimethoprim", "teicoplanina", "tigeciclina", "vancomicina"],
    },
    {
      org: /streptococcus|pneumoniae/i,
      abs: ["ceftriaxone", "clindamicina", "cloranfenicol", "eritromicina", "levofloxacina", "penicilina", "sulfatrimethoprim", "tetraciclina", "vancomicina"],
    },
  ];

  const nums = [];
  for (const bucket of buckets) {
    if (!bucket.abs.includes(key)) continue;
    for (const org of exam.orgs) {
      if (bucket.org.test(org.name)) nums.push(org.number);
    }
  }
  return [...new Set(nums)];
}

function rebalanceAntimicrobialsByOrganismName(exam) {
  if (!exam || exam.orgs.length < 2) return;

  for (const cls of ["R", "S", "I", "D", "Obs"]) {
    for (const org of exam.orgs) {
      const keep = [];
      for (const ab of org[cls]) {
        const candidates = bucketOrgNumbersForAntimicrobial(exam, ab);
        if (candidates.length === 1 && candidates[0] !== org.number) {
          const target = getOrg(exam, candidates[0]);
          uniqPush(target[cls], ab);
        } else {
          keep.push(ab);
        }
      }
      org[cls] = keep;
    }
  }
}

function addAntimicrobialResult(exam, orgNumber, abName, cls) {
  const org = getOrg(exam, orgNumber);
  const label = normalizeAntimicrobialName(abName);
  if (cls === "Obs") uniqPush(org.Obs, label);
  else if (["R", "S", "I", "D"].includes(cls)) uniqPush(org[cls], label);
}

function parseAntimicrobialLine(line, exam, fallbackOrgNumber) {
  const matches = findAntimicrobials(line);
  if (!matches.length) return false;

  let parsed = false;
  for (let i = 0; i < matches.length; i++) {
    const ab = matches[i];
    const next = matches[i + 1];
    const segment = String(line).slice(ab.index, next ? next.index : undefined);
    const classes = classifySegment(segment, ab.name);
    if (!classes.length) continue;

    // Se houver múltiplas classificações no mesmo segmento e múltiplos microrganismos,
    // assume ordem 1, 2, 3... Ex.: "TIGECICLINA <= 0,12 S 1 S".
    if (classes.length > 1 && exam.orgs.length > 1) {
      classes.forEach((cls, idx) => addAntimicrobialResult(exam, exam.orgs[idx]?.number || idx + 1, ab.name, cls));
    } else {
      const orgNumber = likelyOrgForAntimicrobial(exam, ab.name, fallbackOrgNumber);
      addAntimicrobialResult(exam, orgNumber, ab.name, classes[classes.length - 1]);
    }
    parsed = true;
  }

  return parsed;
}

function shouldIgnoreLine(line) {
  return /^(Registro:|Sexo:|Idade:|Emiss[aã]o:|Folha:|Data Nasc\.:|HIST[ÓO]RICO DE EXAMES|Resultado Valores|Resultado PARCIAL Valores|Valores de Refer[eê]ncia|M[eé]todo|DRA\.|DR\s|CRM\b|M[eé]dicos Respons[aá]veis|Os resultados dos exames laboratoriais|Consulte Manual|Material Biol[oó]gico entregue|Espaco entre os memos)/i.test(line);
}

function prepareNewLaudoText(text) {
  let t = String(text || "").replace(/\u00a0/g, " ");

  // Recria quebras de linha quando o Ctrl+C/Ctrl+V vier achatado.
  const markers = [
    "Coletado em:",
    "Liberado em:",
    "ANTIBIOGRAMA",
    "Microrganismos",
    "Antibiogramas",
    "Antimicrobiano",
    "Observações:",
    "Obs:",
    "Legenda",
    "Espaco entre os memos",
    "Médicos Responsáveis",
  ];

  for (const marker of markers) {
    const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`\\s+(${escaped})`, "gi"), "\n$1");
  }

  // Quebra antes de "1 - Nome do microrganismo".
  t = t.replace(/\s+(?=\d+\s*-\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ])/g, "\n");

  // Quebra antes de antimicrobianos que ficaram no fim da linha anterior.
  // Isso ajuda quando o PDF cola várias drogas em uma única linha.
  for (const ab of ANTIMICROBIALS_SORTED) {
    const re = new RegExp(`\\s+(?=${antimicrobialRegexSource(ab)}(?:\\s|$|[<>=#*]))`, "gi");
    t = t.replace(re, "\n");
  }

  return t;
}

function finalizeExam(exam, out) {
  if (!exam) return;

  rebalanceAntimicrobialsByOrganismName(exam);

  exam.orgs = exam.orgs.filter((org) => {
    const hasName = org.name && !/^Organismo\s+\d+$/i.test(org.name);
    const hasAtb = org.R.length || org.S.length || org.I.length || org.D.length || org.Obs.length;
    return hasName || hasAtb;
  });

  if (!exam.orgs.length) return;

  const date = ddmm(exam.collectionDate);
  const orgText = exam.orgs
    .sort((a, b) => a.number - b.number)
    .map((org) => {
      const parts = [];
      if (org.R.length) parts.push(`R: ${org.R.join(", ")}`);
      if (org.S.length) parts.push(`S: ${org.S.join(", ")}`);
      if (org.I.length) parts.push(`I: ${org.I.join(", ")}`);
      if (org.D.length) parts.push(`D: ${org.D.join(", ")}`);
      if (org.Obs.length) parts.push(`Obs: ${org.Obs.join(", ")}`);
      return parts.length ? `${org.name} (${parts.join(" | ")})` : org.name;
    })
    .join(" + ");

  let line = date ? `(${date}) ` : "";
  line += `${exam.material}: ${orgText}`;
  if (exam.resistanceNotes.length) line += ` [${exam.resistanceNotes.join("; ")}]`;
  if (exam.isPartial) line += " — parcial";
  out.push(line);
}

function parseCultures(text) {
  const lines = prepareNewLaudoText(text).split(/\r?\n/);
  const out = [];
  let exam = null;
  let lastOrgNumber = null;

  function ensureExam() {
    if (!exam) exam = newExam();
    return exam;
  }

  function finishExam() {
    finalizeExam(exam, out);
    exam = null;
    lastOrgNumber = null;
  }

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    const mCollection = line.match(/^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+\d{2}:\d{2})?/i);
    if (mCollection) {
      if (exam && (exam.collectionDate || exam.orgs.length)) finishExam();
      ensureExam().collectionDate = mCollection[1];
      continue;
    }

    if (/^Resultado\s+PARCIAL/i.test(line)) {
      ensureExam().isPartial = true;
      continue;
    }

    if (shouldIgnoreLine(line)) continue;

    const kpc = line.match(/\b(KPC|NDM|VIM|IMP|OXA[- ]?48)\s*:\s*POSITIVO\b/i);
    if (kpc && exam) {
      uniqPush(exam.resistanceNotes, `${kpc[1].toUpperCase().replace(/\s+/g, "")}: positivo`);
      continue;
    }

    // Linha de microrganismo: pode vir sozinha ou junto com o primeiro antimicrobiano.
    const mOrg = line.match(/^(\d+)\s*-\s*(.+)$/);
    if (mOrg) {
      const current = ensureExam();
      const n = parseInt(mOrg[1], 10);
      if (!n || n < 1 || n > 20) continue;
      let rest = mOrg[2].trim();
      if (/^Cl[ií]nica:/i.test(rest)) continue;
      const firstAb = findAntimicrobials(rest)[0];

      if (firstAb) {
        const orgName = rest.slice(0, firstAb.index).trim();
        setOrgName(current, n, orgName);
        lastOrgNumber = n;
        parseAntimicrobialLine(rest.slice(firstAb.index), current, n);
      } else {
        setOrgName(current, n, rest);
        lastOrgNumber = n;
      }
      continue;
    }

    // Linhas de cabeçalho não devem ser interpretadas como resultado.
    if (/^(ANTIBIOGRAMA|Antibiogramas|Microrganismos|Antimicrobiano|Legenda|S - Sensível|I - Intermediário|R - Resistente|D -|P - Positivo|N - Negativo)/i.test(line)) {
      // Alguns PDFs colam um antimicrobiano depois de "Legenda".
      if (/^Legenda/i.test(line) && exam) parseAntimicrobialLine(line.replace(/^Legenda\s*/i, ""), exam, lastOrgNumber);
      continue;
    }

    if (exam && parseAntimicrobialLine(line, exam, lastOrgNumber)) continue;
  }

  finishExam();
  return out.join("\n");
}

// Ajuda para testar no console do navegador, se necessário.
window.parseCultures = parseCultures;

/* ===============================
   BOTÕES DA INTERFACE
   =============================== */

document.getElementById("processBtn")?.addEventListener("click", () => {
  const raw = document.getElementById("input")?.value || "";
  lastFormattedText = parseCultures(raw);
  document.getElementById("output").value = filterFormattedByAntibiotics(lastFormattedText, selectedAntibiotics);
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
