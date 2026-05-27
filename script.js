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

function formatCollectionDate(dateStr, timeStr) {
  const m = String(dateStr || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return "";

  const format = document.getElementById("dateFormat")?.value || "ddmm";
  const showTime = Boolean(document.getElementById("showCollectionTime")?.checked);

  const dd = m[1];
  const mm = m[2];
  const yyyy = m[3];
  const yy = yyyy.slice(-2);

  let dateLabel = `${dd}/${mm}`;
  if (format === "ddmmaa") dateLabel = `${dd}/${mm}/${yy}`;
  if (format === "ddmmaaaa") dateLabel = `${dd}/${mm}/${yyyy}`;

  const timeLabel = String(timeStr || "").match(/^\d{2}:\d{2}$/) ? timeStr : "";
  return showTime && timeLabel ? `${dateLabel} ${timeLabel}` : dateLabel;
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

function antibioticFilterKeys(name) {
  const key = canonicalKey(String(name || "").replace(/__HL__/gi, "HL"));
  const keys = [key];

  // No laudo do Enterococcus, aminoglicosídeos de alto nível aparecem como
  // Gentamicina (HL) e Estreptomicina (HL). Na interface, mantemos apenas os
  // botões-base Gentamicina e Estreptomicina. Por isso, para o filtro,
  // também testamos a versão sem o sufixo HL.
  if (key.endsWith("hl")) keys.push(key.replace(/hl$/, ""));

  return [...new Set(keys.filter(Boolean))];
}

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
            const keys = antibioticFilterKeys(name.replace(hl, "HL"));
            const keysWithButtons = keys.filter((key) => antibioticsWithButtons.has(key));

            // Se não existe botão correspondente, não removemos automaticamente.
            if (!keysWithButtons.length) return true;

            // Se qualquer chave equivalente estiver selecionada, mantém.
            // Ex.: Gentamicina (HL) é mantida quando Gentamicina está selecionada.
            return keysWithButtons.some((key) => selectedSet.has(key));
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
  updateOutputFromCurrentInput();
}

function getAntibioticButtonKey(btn) {
  const label = (btn?.dataset?.antibiotico || "").trim();
  return label ? canonicalKey(label) : "";
}

function setAntibioticButtonSelected(btn, selected) {
  const key = getAntibioticButtonKey(btn);
  if (!key) return;

  if (selected) {
    selectedAntibiotics.add(key);
    btn.classList.add("selected");
  } else {
    selectedAntibiotics.delete(key);
    btn.classList.remove("selected");
  }
}

function updateCategoryToggles() {
  document.querySelectorAll(".antibiotic-category-box").forEach((box) => {
    const buttons = Array.from(box.querySelectorAll(".antibiotic-btn[data-antibiotico]"));
    const selectAll = box.querySelector(".category-select-all");
    const clear = box.querySelector(".category-clear");

    if (!buttons.length) return;

    const selectedCount = buttons.filter((btn) => selectedAntibiotics.has(getAntibioticButtonKey(btn))).length;
    const allSelected = selectedCount === buttons.length;
    const noneSelected = selectedCount === 0;

    if (selectAll) {
      selectAll.classList.toggle("active", allSelected);
      selectAll.title = allSelected ? "Todos os itens desta categoria já estão selecionados" : "Selecionar todos desta categoria";
    }

    if (clear) {
      clear.classList.toggle("active", noneSelected);
      clear.title = noneSelected ? "Esta categoria já está limpa" : "Limpar seleção desta categoria";
    }
  });
}

function applyCategorySelection(box, selected) {
  const buttons = box.querySelectorAll(".antibiotic-btn[data-antibiotico]");
  buttons.forEach((btn) => setAntibioticButtonSelected(btn, selected));
  updateCategoryToggles();
  applyAntibioticFilter();
}

function setAllAntibiotics(selected) {
  selectedAntibiotics.clear();
  antibioticButtons.forEach((btn) => setAntibioticButtonSelected(btn, selected));
  updateCategoryToggles();
  applyAntibioticFilter();
}

antibioticButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const key = getAntibioticButtonKey(btn);
    if (!key) return;

    setAntibioticButtonSelected(btn, !selectedAntibiotics.has(key));
    updateCategoryToggles();
    applyAntibioticFilter();
  });
});

document.querySelectorAll(".category-select-all").forEach((button) => {
  button.addEventListener("click", () => {
    const box = button.closest(".antibiotic-category-box");
    if (!box) return;
    applyCategorySelection(box, true);
  });
});

document.querySelectorAll(".category-clear").forEach((button) => {
  button.addEventListener("click", () => {
    const box = button.closest(".antibiotic-category-box");
    if (!box) return;
    applyCategorySelection(box, false);
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

function newExam(manualMaterial) {
  const manual = String(manualMaterial || "").trim();
  return {
    collectionDate: null,
    collectionTime: null,
    isPartial: false,
    material: manual || "Material não informado",
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

function stripLegendFromAntimicrobialSegment(segment) {
  // Alguns PDFs CLSI colam a legenda na mesma linha do resultado:
  //   PENICILINA >= 0,5 R I - Intermediário
  //   RIFAMPICINA <= 0,03 S R - Resistente
  //   SULFA + TRIMETHOPRIM <= 10 S D - (SDD) Sensível Dose Dependente
  // Sem remover isso, o parser acabava lendo a letra da legenda como se fosse
  // a classificação do antibiótico.
  return String(segment || "")
    .replace(/\bS\s*-\s*Sens[ií]vel[\s\S]*$/i, "")
    .replace(/\bI\s*-\s*Intermedi[aá]rio[\s\S]*$/i, "")
    .replace(/\bR\s*-\s*Resistente[\s\S]*$/i, "")
    .replace(/\bD\s*-\s*\(?(?:SDD)?\)?\s*Sens[ií]vel\s+Dose\s+Dependente[\s\S]*$/i, "")
    .replace(/\bP\s*-\s*Positivo[\s\S]*$/i, "")
    .replace(/\bN\s*-\s*Negativo[\s\S]*$/i, "")
    .replace(/\bLegenda\b[\s\S]*$/i, "")
    .trim();
}

function classifySegment(segment, abName) {
  const cleanSegment = stripLegendFromAntimicrobialSegment(segment);
  const s = normalizePlain(cleanSegment);

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
  while ((m = re.exec(cleanSegment)) !== null) tokens.push(m[1].toUpperCase());

  if (tokens.length) return tokens;

  if (/colistina/i.test(abName) && /\*/.test(cleanSegment)) return ["S"];
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

function applyAntimicrobialClasses(exam, abName, resultText, fallbackOrgNumber) {
  const classes = classifySegment(resultText, abName);
  if (!classes.length) return false;

  // Se houver múltiplas classificações no mesmo resultado e múltiplos microrganismos,
  // assume ordem 1, 2, 3... Ex.: "<= 0,12 S 1 S".
  if (classes.length > 1 && exam.orgs.length > 1) {
    classes.forEach((cls, idx) => addAntimicrobialResult(exam, exam.orgs[idx]?.number || idx + 1, abName, cls));
  } else {
    const orgNumber = likelyOrgForAntimicrobial(exam, abName, fallbackOrgNumber);
    addAntimicrobialResult(exam, orgNumber, abName, classes[classes.length - 1]);
  }
  return true;
}

function parseAntimicrobialLine(line, exam, fallbackOrgNumber) {
  const matches = findAntimicrobials(line);
  if (!matches.length) return false;

  let parsed = false;
  for (let i = 0; i < matches.length; i++) {
    const ab = matches[i];
    const next = matches[i + 1];
    const segment = String(line).slice(ab.index, next ? next.index : undefined);
    parsed = applyAntimicrobialClasses(exam, ab.name, segment, fallbackOrgNumber) || parsed;
  }

  return parsed;
}

function getSingleAntimicrobialName(line) {
  const clean = String(line || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;

  const matches = findAntimicrobials(clean);
  if (matches.length !== 1) return null;

  const m = matches[0];
  const before = clean.slice(0, m.index).trim();
  const after = clean.slice(m.end).trim();

  // Só considera "linha de antibiótico" quando a linha é basicamente apenas o nome.
  // Ex.: "AMICACINA" ou "ESTREPTOMICINA (HL)".
  if (before || after) return null;
  return m.name;
}

function looksLikeResultOnlyLine(line) {
  const s = String(line || "").trim();
  if (!s) return false;
  if (findAntimicrobials(s).length) return false;
  if (/^(S|I|R|D)$/i.test(s)) return true;
  if (/^(?:[<>]=?\s*)?\d+(?:[,.]\d+)?\s+(?:S|I|R|D)(?:\s+\d+\s+(?:S|I|R|D))*$/i.test(s)) return true;
  if (/^#|^\*/.test(s)) return true;
  if (/consultar\s+observa/i.test(s)) return true;
  if (/sens[ií]vel|resistente|intermedi[aá]rio|dose\s+dependente/i.test(s)) return true;
  return false;
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

  const date = formatCollectionDate(exam.collectionDate, exam.collectionTime);
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

function parseCultures(text, manualMaterial) {
  const lines = prepareNewLaudoText(text).split(/\r?\n/);
  const out = [];
  let exam = null;
  let lastOrgNumber = null;
  let pendingAntimicrobial = null; // quando vem ANTIBIÓTICO em uma linha e resultado na seguinte

  function ensureExam() {
    if (!exam) exam = newExam(manualMaterial);
    return exam;
  }

  function finishExam() {
    finalizeExam(exam, out);
    exam = null;
    lastOrgNumber = null;
    pendingAntimicrobial = null;
  }

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line) continue;

    const mCollection = line.match(/^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/i);
    if (mCollection) {
      if (exam && (exam.collectionDate || exam.orgs.length)) finishExam();
      const current = ensureExam();
      current.collectionDate = mCollection[1];
      current.collectionTime = mCollection[2] || null;
      continue;
    }

    // Heurística de material: quando o laudo foi semeado em meios Bactec,
    // tratamos como hemocultura. Isso funciona mesmo quando o campo do
    // material veio como imagem no PDF e não foi copiado no Ctrl+C/Ctrl+V.
    if (/(^|\s)bactec(\s|$|[-])/i.test(line)) {
      const current = ensureExam();
      current.material = "Hemocultura";
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

    // Padrão real do Ctrl+C/Ctrl+V do PDF:
    //   AMICACINA
    //   4 S
    // Nesse caso guardamos o antibiótico e aplicamos o resultado da próxima linha.
    if (exam && pendingAntimicrobial && looksLikeResultOnlyLine(line)) {
      applyAntimicrobialClasses(exam, pendingAntimicrobial, line, lastOrgNumber);
      pendingAntimicrobial = null;
      continue;
    }

    // Se apareceu uma linha só com nome de antimicrobiano, aguarda a linha seguinte.
    const singleAb = getSingleAntimicrobialName(line);
    if (exam && singleAb) {
      pendingAntimicrobial = singleAb;
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
        pendingAntimicrobial = null;
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

    if (exam && parseAntimicrobialLine(line, exam, lastOrgNumber)) {
      pendingAntimicrobial = null;
      continue;
    }
  }

  finishExam();
  return out.join("\n");
}

// Ajuda para testar no console do navegador, se necessário.
window.parseCultures = parseCultures;

/* ===============================
   BOTÕES DA INTERFACE
   =============================== */

function updateOutputFromCurrentInput() {
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  const manualMaterialEl = document.getElementById("manualMaterial");
  if (!inputEl || !outputEl) return;

  const raw = inputEl.value || "";
  const manualMaterial = manualMaterialEl?.value || "";

  if (!raw.trim()) {
    lastFormattedText = "";
    outputEl.value = "";
    return;
  }

  lastFormattedText = parseCultures(raw, manualMaterial);
  outputEl.value = filterFormattedByAntibiotics(lastFormattedText, selectedAntibiotics);
}

function clearCurrentLaudo() {
  const inputEl = document.getElementById("input");
  const outputEl = document.getElementById("output");
  if (inputEl) inputEl.value = "";
  if (outputEl) outputEl.value = "";
  lastFormattedText = "";
}

function appendOutputToDraft() {
  const outputEl = document.getElementById("output");
  const draftEl = document.getElementById("draft");
  if (!outputEl || !draftEl) return;

  const textToAdd = outputEl.value.trim();
  if (!textToAdd) {
    showToast("Nada para adicionar");
    return;
  }

  const currentDraft = draftEl.value.trimEnd();
  draftEl.value = currentDraft ? `${currentDraft}
${textToAdd}` : textToAdd;

  clearCurrentLaudo();
  showToast("Adicionado ao rascunho");
}

async function copyTextareaValue(textareaId, successMessage = "Copiado!") {
  const el = document.getElementById(textareaId);
  if (!el) return;

  try {
    await navigator.clipboard.writeText(el.value || "");
    showToast(successMessage);
  } catch (err) {
    showToast("Erro ao copiar");
  }
}

function clearDraft() {
  const draftEl = document.getElementById("draft");
  if (!draftEl) return;
  draftEl.value = "";
  showToast("Rascunho limpo");
}

document.getElementById("input")?.addEventListener("input", updateOutputFromCurrentInput);
document.getElementById("manualMaterial")?.addEventListener("input", updateOutputFromCurrentInput);
document.getElementById("dateFormat")?.addEventListener("change", updateOutputFromCurrentInput);
document.getElementById("showCollectionTime")?.addEventListener("change", updateOutputFromCurrentInput);
document.getElementById("processBtn")?.addEventListener("click", updateOutputFromCurrentInput);
document.getElementById("addToDraftBtn")?.addEventListener("click", appendOutputToDraft);
document.getElementById("clearCurrentBtn")?.addEventListener("click", () => { clearCurrentLaudo(); showToast("Laudo atual limpo"); });
document.getElementById("copyBtn")?.addEventListener("click", () => copyTextareaValue("output", "Saída copiada!"));
document.getElementById("copyDraftBtn")?.addEventListener("click", () => copyTextareaValue("draft", "Rascunho copiado!"));
document.getElementById("clearDraftBtn")?.addEventListener("click", clearDraft);

function showToast(message) {
  const toast = document.getElementById("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2000);
}
