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

  const cleanTime = String(timeStr || "").trim();
  return showTime && cleanTime ? `${dateLabel} ${cleanTime}` : dateLabel;
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

function cleanOrganismName(name) {
  let s = String(name || "").trim();
  // Remove prefixos como "Microrganismo Isolado:", "Microrganismo testado:", "Microrganismo:", "Isolado:"
  s = s.replace(/^(?:Microrganismo\s+(?:Isolado|testado)|Microrganismo|Isolado)\s*:\s*/i, "");
  // Remove a palavra "Complexo" / "complex" de forma isolada
  s = s.replace(/\bComplexo\b/gi, "");
  s = s.replace(/\bcomplex\b/gi, "");
  // Remove caracteres residuais do início/fim
  s = s.replace(/^[-–—\s\.\/]+|[-–—\s\.\/]+$/g, "");
  s = s.replace(/\s+/g, " ");
  return s.trim();
}

function detectMaterialFromText(text) {
  const norm = normalizePlain(text);
  
  if (norm.includes("sangue periferico") || norm.includes("hemocultura") || norm.includes("bactec")) {
    return "Hemocultura";
  }
  if (norm.includes("urina de sonda vesical de alivio") || norm.includes("urina sonda vesical alivio")) {
    return "Urina (sonda vesical de alívio)";
  }
  if (norm.includes("urina de sonda vesical de demora") || norm.includes("urina sonda vesical demora") || norm.includes("urina de sonda") || norm.includes("urina sonda")) {
    return "Urina (sonda vesical de demora)";
  }
  if (norm.includes("urina") || norm.includes("urocultura")) {
    return "Urina";
  }
  if (norm.includes("secrecao traqueal") || norm.includes("secreção traqueal")) {
    return "Secreção Traqueal";
  }
  if (norm.includes("liquor") || norm.includes("liquido cefalorraquidiano") || norm.includes("lcr")) {
    return "Líquor";
  }
  if (norm.includes("ponta de cateter") || norm.includes("cateter cvc") || norm.includes("ponta do cateter")) {
    return "Ponta de Cateter";
  }
  if (norm.includes("cateter permcath") || norm.includes("permcath")) {
    return "Cateter Permcath";
  }
  if (norm.includes("cateter duplo lumen") || norm.includes("cateter")) {
    return "Cateter";
  }
  if (norm.includes("partes moles") || norm.includes("fragmento de partes moles") || norm.includes("fragmento partes moles")) {
    return "Partes moles";
  }
  if (norm.includes("fragmento") || norm.includes("tecido") || norm.includes("biopsia") || norm.includes("biópsia")) {
    return "Fragmento de Tecido";
  }
  if (norm.includes("escarro")) {
    return "Escarro";
  }
  if (norm.includes("liquido pleural")) {
    return "Líquido Pleural";
  }
  if (norm.includes("liquido ascitico") || norm.includes("liquido ascítico")) {
    return "Líquido Ascítico";
  }
  if (norm.includes("liquido sinovial")) {
    return "Líquido Pleural";
  }
  if (norm.includes("abscesso") || norm.includes("secrecao de abscesso")) {
    return "Abscesso";
  }
  if (norm.includes("secrecao de lesao") || norm.includes("secreção de lesão") || norm.includes("secrecao de ferida")) {
    return "Secreção de Lesão";
  }
  if (norm.includes("bile")) {
    return "Bile";
  }
  if (norm.includes("pus")) {
    return "Pus";
  }
  return null;
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

/* ===============================
   PARSER REESTRUTURADO E AUXILIARES
   =============================== */

function stripLegendFromAntimicrobialSegment(segment) {
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
  if (/presenca\s+de\s+sinergis/i.test(s) || /presenca\s+de\s+sinergia/i.test(s)) return ["S"];
  if (/ausencia\s+de\s+sinergis/i.test(s) || /ausencia\s+de\s+sinergia/i.test(s)) return ["R"];

  const tokens = [];
  const re = /(?:^|\s)([SRID])(?=\s|$)/gi;
  let m;
  while ((m = re.exec(cleanSegment)) !== null) tokens.push(m[1].toUpperCase());

  if (tokens.length) return tokens;

  if (/colistina/i.test(abName) && /\*/.test(cleanSegment)) return ["S"];
  return [];
}

function applyAntimicrobialClassesToObj(abName, resultText, antibiogram) {
  const classes = classifySegment(resultText, abName);
  if (!classes.length) return false;

  const label = normalizeAntimicrobialName(abName);
  const cls = classes[classes.length - 1];
  if (["R", "S", "I", "D", "Obs"].includes(cls)) {
    uniqPush(antibiogram[cls], label);
  }
  return true;
}

function parseAntimicrobialLineToObj(line, antibiogram) {
  const matches = findAntimicrobials(line);
  if (!matches.length) return false;

  let parsed = false;
  for (let i = 0; i < matches.length; i++) {
    const ab = matches[i];
    const next = matches[i + 1];
    const segment = String(line).slice(ab.index, next ? next.index : undefined);
    parsed = applyAntimicrobialClassesToObj(ab.name, segment, antibiogram) || parsed;
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
  let t = String(text || "").replace(/\u00a0/g, " ").replace(/['"]/g, "");

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

  t = t.replace(/\s+(?=\d+\s*-\s*[A-ZÁÉÍÓÚÂÊÔÃÕÇ][A-Za-zÀ-ÿ])/g, "\n");

  for (const ab of ANTIMICROBIALS_SORTED) {
    const re = new RegExp(`\\s+(?=${antimicrobialRegexSource(ab)}(?:\\s|$|[<>=#*]))`, "gi");
    t = t.replace(re, "\n");
  }

  return t;
}

/* ===============================
   EXTRACTOR E PARSERS ESPECÍFICOS
   =============================== */

function extractMaterialAndSite(header, manualMaterial, blockLines = []) {
  // Se for hemocultura pelo cabeçalho
  if (header) {
    const upperHeader = header.toUpperCase();
    if (upperHeader.includes("SANGUE PERIFÉRICO") || upperHeader.includes("HEMOCULTURA") || upperHeader.includes("SANGUE")) {
      let site = null;
      const siteMatch = upperHeader.match(/\b(MSE\s*MAO|MSE\s*MÃO|MSD\s*MAO|MSD\s*MÃO|MSE|MSD|MID|MIE|CATETER|CVC|PUNÇÃO)\b/i);
      if (siteMatch) {
        site = siteMatch[1].toUpperCase().replace("MAO", "MÃO");
      }
      return { material: "Hemocultura", site };
    }

    if (upperHeader.includes("URINA") || upperHeader.includes("UROCULTURA")) {
      let material = "Urina";
      if (upperHeader.includes("SONDA")) {
        if (upperHeader.includes("ALÍVIO") || upperHeader.includes("ALIVIO")) {
          material = "Urina (sonda vesical de alívio)";
        } else {
          material = "Urina (sonda vesical de demora)";
        }
      }
      return { material, site: null };
    }
  }

  // Tenta extrair material específico do título
  let rawMaterial = "";
  if (header) {
    let clean = header.replace(/^(CULTURA\s+(?:AERÓBIA|PARA\s+ANAERÓBIOS|FÚNGICA|PARA\s+FUNGOS)|EXAME\s+BACTERIOSCÓPICO|BACTERIOSCÓPICO(?:\s+DE\s+HEMOCULTURA\s+(?:AEROBIA|ANAERÓBIA))?|CONCENTRAÇÃO\s+INIBITÓRIA\s+MÍNIMA|CIM)\s*-\s*/i, "");
    
    // Se o cabeçalho tinha apenas o prefixo genérico, clean será igual ao header.
    // Para evitar tratar títulos genéricos como nome de material, limpamos se for igual ou muito parecido.
    const isGenericHeader = /^(CULTURA\s+(?:AERÓBIA|PARA\s+ANAERÓBIOS|FÚNGICA|PARA\s+FUNGOS)|EXAME\s+BACTERIOSCÓPICO|BACTERIOSCÓPICO|CONCENTRAÇÃO\s+INIBITÓRIA\s+MÍNIMA|CIM)$/i.test(clean.trim());
    if (!isGenericHeader) {
      const parts = clean.split(/[-–—,]/).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        rawMaterial = parts[0];
      }
    }
  }

  // Se o material obtido do título for vazio ou genérico, tenta varrer as linhas do bloco
  if (!rawMaterial && blockLines && blockLines.length > 0) {
    for (const line of blockLines) {
      const detected = detectMaterialFromText(line);
      if (detected) {
        rawMaterial = detected;
        break;
      }
    }
  }

  // Se ainda assim não encontrar nada, tenta varrer o header com o detector inteligente
  if (!rawMaterial && header) {
    const detected = detectMaterialFromText(header);
    if (detected) {
      rawMaterial = detected;
    }
  }

  // Se encontrar, higieniza nomes comuns
  let finalMaterial = "";
  if (rawMaterial) {
    const upperRaw = rawMaterial.toUpperCase();
    if (upperRaw.includes("SECREÇÃO TRAQUEAL") || upperRaw.includes("SECRECAO TRAQUEAL")) {
      finalMaterial = "Secreção Traqueal";
    } else if (upperRaw.includes("LÍQUOR") || upperRaw.includes("LIQUOR")) {
      finalMaterial = "Líquor";
    } else if (upperRaw.includes("URINA")) {
      if (upperRaw.includes("ALÍVIO") || upperRaw.includes("ALIVIO")) {
        finalMaterial = "Urina (sonda vesical de alívio)";
      } else if (upperRaw.includes("SONDA")) {
        finalMaterial = "Urina (sonda vesical de demora)";
      } else {
        finalMaterial = "Urina";
      }
    } else {
      finalMaterial = toTitleCase(rawMaterial);
    }
  }

  return { material: finalMaterial || manualMaterial || "Material não informado", site: null };
}

function determineSusceptibility(atbName, micVal, refLine) {
  if (micVal === null || micVal === undefined) return "Obs";

  const normText = normalizePlain(refLine);
  const normAtb = normalizePlain(atbName);

  const idx = normText.indexOf(normAtb);
  if (idx === -1) {
    return "S"; // Fallback padrão
  }

  let segment = normText.slice(idx);
  const nextRef = segment.indexOf("valor de referencia", 10);
  if (nextRef !== -1) {
    segment = segment.slice(0, nextRef);
  }

  const sMatches = [...segment.matchAll(/s\s*<=\s*([\d,.]+)/g)].map(m => parseFloat(m[1].replace(",", ".")));
  const rMatches = [...segment.matchAll(/r\s*>=\s*([\d,.]+)/g)].map(m => parseFloat(m[1].replace(",", ".")));

  if (!sMatches.length && !rMatches.length) {
    return "S"; // Fallback
  }

  const minS = Math.min(...sMatches);
  const maxR = Math.max(...rMatches);

  if (sMatches.length && micVal <= minS) {
    return "S";
  }
  if (rMatches.length && micVal >= maxR) {
    return "R";
  }
  if (segment.includes("sae") || segment.includes("intermediario")) {
    return "I";
  }
  return "I";
}

function parseCultureBlock(block, manualMaterial) {
  const { material, site } = extractMaterialAndSite(block.titulo, manualMaterial, block.linhas);
  let isPositive = false;
  let isNegative = false;
  let isIdenticalLink = false;
  const organisms = [];
  const resistanceNotes = [];
  const antibiogram = { R: [], S: [], I: [], D: [], Obs: [] };

  const isBacterioscopico = block.titulo && block.titulo.toUpperCase().includes("BACTERIOSCÓPICO");

  function getOrCreateOrg(name) {
    let org = organisms.find(o => canonicalKey(o.name) === canonicalKey(name));
    if (!org) {
      org = {
        name: name,
        antibiogram: { R: [], S: [], I: [], D: [], Obs: [] },
        resistanceNotes: []
      };
      organisms.push(org);
    }
    return org;
  }

  for (const line of block.linhas) {
    const mResult = line.match(/^(CULTURA\s+(?:AERÓBIA|PARA\s+ANAERÓBIOS))\s+(Positiva|Negativa)/i);
    if (mResult) {
      const res = mResult[2].toLowerCase();
      if (res === "positiva") {
        isPositive = true;
      } else if (res === "negativa") {
        isNegative = true;
      }
      continue;
    }

    if (line === "Negativa" || line === "Ausência de Microrganismos") {
      isNegative = true;
      continue;
    }

    if (isBacterioscopico) {
      const parts = line.split('\t').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2 && /BACTERIOSCÓPICO/i.test(parts[0])) {
        const finding = parts[1];
        if (finding && !/Coloração/i.test(finding) && !/Ausência/i.test(finding)) {
          const orgName = cleanOrganismName(finding);
          getOrCreateOrg(orgName);
          isPositive = true;
        }
      }
    }

    const mOrg = line.match(/^([1-9]\d?)\s*-\s*(.+)$/);
    if (mOrg) {
      isPositive = true;
      let orgName = mOrg[2].trim();
      
      const matches = findAntimicrobials(orgName);
      if (matches.length > 0) {
        orgName = orgName.slice(0, matches[0].index).trim();
      }
      
      orgName = cleanOrganismName(orgName);
      
      if (orgName && !/^Cl[ií]nica:/i.test(orgName)) {
        getOrCreateOrg(orgName);
      }
    }

    const PATHOGENS_RX = /\b(Acinetobacter|Streptococcus|Escherichia|Pseudomonas|Staphylococcus|Klebsiella|Candida|Enterococcus|Nakaseomyces|Enterobacter|Serratia|Proteus|Flora normal)\b/i;
    if (!mOrg && PATHOGENS_RX.test(line)) {
      let orgName = line.trim();
      const matches = findAntimicrobials(orgName);
      if (matches.length > 0) {
        orgName = orgName.slice(0, matches[0].index).trim();
      }
      orgName = orgName.replace(/^[-–—\s]+/, "").trim();
      
      orgName = cleanOrganismName(orgName);
      
      if (/consultar|ccih|observac|nota\b|metodo|semeadura|identificac|especifico/i.test(orgName)) {
        continue;
      }
      
      if (orgName && !/^(CULTURA|EXAME|BACTERIOSCÓPICO|CONCENTRAÇÃO|CIM|VALOR|MÉTODO|LEGENDA|M\.I\.C)/i.test(orgName)) {
        isPositive = true;
        getOrCreateOrg(orgName);
      }
    }

    if (/identificacao\s+e\s+perfil\s+de\s+sensibilidade\s+identicos/i.test(normalizePlain(line))) {
      isPositive = true;
      isIdenticalLink = true;
      continue;
    }
  }

  if (isPositive && organisms.length === 0 && isIdenticalLink) {
    getOrCreateOrg("Identificação idêntica");
  }

  if (isPositive && !isBacterioscopico) {
    let pendingAntimicrobial = null;
    let currentOrg = null;

    for (const line of block.linhas) {
      const mOrg = line.match(/^([1-9]\d?)\s*-\s*(.+)$/);
      let foundOrg = null;
      if (mOrg) {
        let orgName = mOrg[2].trim();
        const matches = findAntimicrobials(orgName);
        if (matches.length > 0) {
          orgName = orgName.slice(0, matches[0].index).trim();
        }
        orgName = cleanOrganismName(orgName);
        if (orgName && !/^Cl[ií]nica:/i.test(orgName)) {
          foundOrg = getOrCreateOrg(orgName);
        }
      } else {
        const PATHOGENS_RX = /\b(Acinetobacter|Streptococcus|Escherichia|Pseudomonas|Staphylococcus|Klebsiella|Candida|Enterococcus|Nakaseomyces|Enterobacter|Serratia|Proteus|Flora normal)\b/i;
        if (PATHOGENS_RX.test(line)) {
          let orgName = line.trim();
          const matches = findAntimicrobials(orgName);
          if (matches.length > 0) {
            orgName = orgName.slice(0, matches[0].index).trim();
          }
          orgName = orgName.replace(/^[-–—\s]+/, "").trim();
          orgName = cleanOrganismName(orgName);
          if (/consultar|ccih|observac|nota\b|metodo|semeadura|identificac|especifico/i.test(orgName)) {
            // Ignora notas como "Consultar CCIH"
          } else if (orgName && !/^(CULTURA|EXAME|BACTERIOSCÓPICO|CONCENTRAÇÃO|CIM|VALOR|MÉTODO|LEGENDA|M\.I\.C)/i.test(orgName)) {
            foundOrg = getOrCreateOrg(orgName);
          }
        }
      }

      if (foundOrg) {
        currentOrg = foundOrg;
      }

      const kpc = line.match(/\b(KPC|NDM|VIM|IMP|OXA[- ]?48)\s*:\s*POSITIVO\b/i);
      if (kpc) {
        const note = `${kpc[1].toUpperCase().replace(/\s+/g, "")}: positivo`;
        resistanceNotes.push(note);
        if (currentOrg) {
          currentOrg.resistanceNotes.push(note);
        }
      }

      if (currentOrg) {
        if (pendingAntimicrobial && looksLikeResultOnlyLine(line)) {
          applyAntimicrobialClassesToObj(pendingAntimicrobial, line, currentOrg.antibiogram);
          applyAntimicrobialClassesToObj(pendingAntimicrobial, line, antibiogram);
          pendingAntimicrobial = null;
          continue;
        }

        const singleAb = getSingleAntimicrobialName(line);
        if (singleAb) {
          pendingAntimicrobial = singleAb;
          continue;
        }

        const parsed1 = parseAntimicrobialLineToObj(line, currentOrg.antibiogram);
        const parsed2 = parseAntimicrobialLineToObj(line, antibiogram);
        if (parsed1 || parsed2) {
          pendingAntimicrobial = null;
        }
      }
    }

    let currentObsCategory = null;
    for (let i = 0; i < block.linhas.length; i++) {
      const line = block.linhas[i];
      const norm = normalizePlain(line);

      if (norm === "sensivel" || norm === "sensivel dose padrao") {
        currentObsCategory = "S";
        continue;
      } else if (norm === "resistente") {
        currentObsCategory = "R";
        continue;
      } else if (norm === "intermediario") {
        currentObsCategory = "I";
        continue;
      } else if (norm === "sensivel dose dependente" || norm === "sdd") {
        currentObsCategory = "D";
        continue;
      }

      if (currentObsCategory) {
        const matches = findAntimicrobials(line);
        if (matches.length > 0) {
          const hasValueIndicator = /valor|mic|m\.i\.c\.|[\d,.]+\s*(?:µg|ug|mg)/i.test(line);
          if (hasValueIndicator) {
            for (const m of matches) {
              const label = normalizeAntimicrobialName(m.name);
              uniqPush(antibiogram[currentObsCategory], label);
              if (organisms.length === 1) {
                uniqPush(organisms[0].antibiogram[currentObsCategory], label);
              } else if (currentOrg) {
                uniqPush(currentOrg.antibiogram[currentObsCategory], label);
              }
            }
          }
        }
        
        if (!line || /^(Notas:|Obs:|Observações:)/i.test(line)) {
          currentObsCategory = null;
        }
      }
    }
  }

  return {
    pedido: block.pedido,
    data: block.coletadoData,
    hora: block.coletadoHora,
    material,
    site,
    isPositive,
    isNegative: isNegative && !isPositive,
    isIdenticalLink,
    isBacterioscopico,
    organisms,
    resistanceNotes,
    antibiogram
  };
}

function parseCimBlock(block, manualMaterial) {
  const { material, site } = extractMaterialAndSite(block.titulo, manualMaterial, block.linhas);
  let organism = null;
  const antibiogram = { R: [], S: [], I: [], D: [], Obs: [] };

  let currentAtbName = null;
  let refLine = "";

  for (const line of block.linhas) {
    const mOrgTest = line.match(/Microrganismo\s+testado\s*:\s*([^\t\n;]+)/i);
    if (mOrgTest) {
      organism = cleanOrganismName(mOrgTest[1].trim());
      continue;
    }

    if (line.startsWith("Valor de referência")) {
      refLine += " " + line;
    }
  }

  for (const line of block.linhas) {
    const mAtb = line.match(/Antibiótico\s+testado\s*:\s*(.+)/i);
    if (mAtb) {
      currentAtbName = mAtb[1].trim();
      continue;
    }

    const mMic = line.match(/M\.I\.C\.\s*:\s*([\d,.]+)/i);
    if (mMic && currentAtbName) {
      const micVal = parseFloat(mMic[1].replace(",", "."));
      const cls = determineSusceptibility(currentAtbName, micVal, refLine);
      const label = normalizeAntimicrobialName(currentAtbName);

      if (["R", "S", "I", "D", "Obs"].includes(cls)) {
        uniqPush(antibiogram[cls], label);
      }
      currentAtbName = null;
    }
  }

  return {
    pedido: block.pedido,
    data: block.coletadoData,
    hora: block.coletadoHora,
    material,
    site,
    isCim: true,
    organism,
    antibiogram,
    organisms: organism ? [{ name: organism, antibiogram, resistanceNotes: [] }] : []
  };
}

/* ===============================
   SEGMENTADOR E CONSOLIDADOR
   =============================== */

function segmentIntoBlocks(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const blocks = [];
  let currentBlock = null;

  for (const line of lines) {
    const isTimestamp = /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}$/.test(line);
    const mPedido = line.match(/^Pedido\s*:\s*(\d+)$/i);

    let startNewBlock = false;
    if (isTimestamp) {
      if (currentBlock && (currentBlock.titulo || currentBlock.linhas.length)) {
        startNewBlock = true;
      }
    } else if (mPedido) {
      if (currentBlock && currentBlock.pedido) {
        startNewBlock = true;
      }
    }

    if (startNewBlock) {
      blocks.push(currentBlock);
      currentBlock = null;
    }

    if (!currentBlock) {
      currentBlock = {
        pedido: mPedido ? mPedido[1] : null,
        dataHora: isTimestamp ? line : null,
        coletadoData: null,
        coletadoHora: null,
        titulo: null,
        linhas: []
      };
      if (isTimestamp || mPedido) {
        continue;
      }
    }

    const mColetado = line.match(/^Coletado\s+em:\s*(\d{2}\/\d{2}\/\d{4})(?:\s+(\d{2}:\d{2}))?/i);
    if (mColetado) {
      currentBlock.coletadoData = mColetado[1];
      currentBlock.coletadoHora = mColetado[2] || null;
      continue;
    }

    if (mPedido && !currentBlock.pedido) {
      currentBlock.pedido = mPedido[1];
      continue;
    }

    if (line === "DIVISÃO DE LABORATÓRIO CENTRAL HCFMUSP") {
      continue;
    }

    if (!currentBlock.titulo && /^(CULTURA|CONCENTRAÇÃO|BACTERIOSCÓPICO|EXAME|CIM)\b/i.test(line)) {
      currentBlock.titulo = line;
      continue;
    }

    currentBlock.linhas.push(line);
  }

  if (currentBlock && (currentBlock.titulo || currentBlock.linhas.length)) {
    blocks.push(currentBlock);
  }

  return blocks;
}

function resolveAntibiogramConflicts(antibiogram) {
  const allR = new Set((antibiogram.R || []).map(canonicalKey));
  const allI = new Set((antibiogram.I || []).map(canonicalKey));
  const allD = new Set((antibiogram.D || []).map(canonicalKey));
  const allS = new Set((antibiogram.S || []).map(canonicalKey));

  antibiogram.S = (antibiogram.S || []).filter(drug => !allR.has(canonicalKey(drug)) && !allI.has(canonicalKey(drug)) && !allD.has(canonicalKey(drug)));
  antibiogram.D = (antibiogram.D || []).filter(drug => !allR.has(canonicalKey(drug)) && !allI.has(canonicalKey(drug)));
  antibiogram.I = (antibiogram.I || []).filter(drug => !allR.has(canonicalKey(drug)));
  antibiogram.Obs = (antibiogram.Obs || []).filter(drug => !allR.has(canonicalKey(drug)) && !allI.has(canonicalKey(drug)) && !allD.has(canonicalKey(drug)) && !allS.has(canonicalKey(drug)));
}

function consolidateOrganisms(allOrganisms) {
  const grouped = {};
  for (const org of allOrganisms) {
    if (!org || !org.name) continue;
    const key = canonicalKey(org.name);
    if (!grouped[key]) {
      grouped[key] = {
        name: org.name,
        antibiogram: { R: [], S: [], I: [], D: [], Obs: [] },
        resistanceNotes: []
      };
    }
    // Merge antibiograms
    for (const cls of ["R", "S", "I", "D", "Obs"]) {
      if (org.antibiogram && org.antibiogram[cls]) {
        for (const drug of org.antibiogram[cls]) {
          uniqPush(grouped[key].antibiogram[cls], drug);
        }
      }
    }
    // Merge resistance notes
    if (org.resistanceNotes) {
      for (const note of org.resistanceNotes) {
        if (!grouped[key].resistanceNotes.includes(note)) {
          grouped[key].resistanceNotes.push(note);
        }
      }
    }
  }
  
  let result = Object.values(grouped);
  const hasActualOrganism = result.some(org => canonicalKey(org.name) !== canonicalKey("Identificação idêntica"));
  if (hasActualOrganism) {
    result = result.filter(org => canonicalKey(org.name) !== canonicalKey("Identificação idêntica"));
  }
  for (const org of result) {
    resolveAntibiogramConflicts(org.antibiogram);
  }
  return result;
}

function consolidateExams(parsedExams) {
  const groupedByDate = {};

  for (const exam of parsedExams) {
    const date = exam.data || "Sem data";
    if (!groupedByDate[date]) {
      groupedByDate[date] = [];
    }
    groupedByDate[date].push(exam);
  }

  const outputLines = [];
  const dates = Object.keys(groupedByDate);

  for (const date of dates) {
    const dateExams = groupedByDate[date];

    const hemoculturas = dateExams.filter(e => e.material === "Hemocultura");
    const outros = dateExams.filter(e => e.material !== "Hemocultura");

    // 1. Hemoculturas
    if (hemoculturas.length > 0) {
      const cultureBottles = hemoculturas.filter(e => !e.isCim && !e.isBacterioscopico);
      const cimTests = hemoculturas.filter(e => e.isCim);

      const totalBottles = cultureBottles.length;
      const positiveBottles = cultureBottles.filter(b => b.isPositive).length;

      const sites = [...new Set(cultureBottles.map(b => b.site).filter(Boolean))].sort();
      const sitesLabel = sites.length > 0 ? ` (${sites.join("/")})` : "";

      const times = [...new Set(cultureBottles.map(b => b.hora).filter(Boolean))].sort();
      const timeLabel = times.length > 0 ? times.join("/") : null;

      if (positiveBottles > 0) {
        const allOrgs = [];
        for (const b of cultureBottles) {
          if (b.isPositive && b.organisms) {
            allOrgs.push(...b.organisms);
          }
        }
        for (const c of cimTests) {
          if (c.organisms) {
            allOrgs.push(...c.organisms);
          }
        }

        const consolidatedOrgs = consolidateOrganisms(allOrgs);
        const orgStrings = [];
        for (const org of consolidatedOrgs) {
          const atbParts = [];
          if (org.antibiogram.S.length) atbParts.push(`S: ${org.antibiogram.S.join(", ")}`);
          if (org.antibiogram.R.length) atbParts.push(`R: ${org.antibiogram.R.join(", ")}`);
          if (org.antibiogram.I.length) atbParts.push(`I: ${org.antibiogram.I.join(", ")}`);
          if (org.antibiogram.D.length) atbParts.push(`D: ${org.antibiogram.D.join(", ")}`);
          if (org.antibiogram.Obs.length) atbParts.push(`Obs: ${org.antibiogram.Obs.join(", ")}`);
          
          const atbLabel = atbParts.length > 0 ? ` (${atbParts.join(" | ")})` : "";
          const notesLabel = org.resistanceNotes && org.resistanceNotes.length > 0
            ? ` [${[...new Set(org.resistanceNotes)].join("; ")}]`
            : "";
          orgStrings.push(`${org.name}${atbLabel}${notesLabel}`);
        }

        const dateFormatted = formatCollectionDate(date, timeLabel);
        const dateLabel = dateFormatted ? `(${dateFormatted}) ` : "";

        outputLines.push(`${dateLabel}Hemocultura${sitesLabel}: ${orgStrings.join(" + ")} (${positiveBottles}/${totalBottles} frascos positivos)`);
      } else if (totalBottles > 0) {
        const dateFormatted = formatCollectionDate(date, timeLabel);
        const dateLabel = dateFormatted ? `(${dateFormatted}) ` : "";
        outputLines.push(`${dateLabel}Hemocultura${sitesLabel}: Negativa`);
      }
    }

    // 2. Outros materiais
    const outrosAgrupados = {};
    for (const e of outros) {
      if (!outrosAgrupados[e.material]) {
        outrosAgrupados[e.material] = [];
      }
      outrosAgrupados[e.material].push(e);
    }

    for (const mat of Object.keys(outrosAgrupados)) {
      const matExams = outrosAgrupados[mat];
      
      const cultureExams = matExams.filter(e => !e.isBacterioscopico);
      const bacterioscopicos = matExams.filter(e => e.isBacterioscopico);

      const times = [...new Set(matExams.map(e => e.hora).filter(Boolean))].sort();
      const timeLabel = times.length > 0 ? times.join("/") : null;
      const dateFormatted = formatCollectionDate(date, timeLabel);
      const dateLabel = dateFormatted ? `(${dateFormatted}) ` : "";

      if (cultureExams.length > 0) {
        const positiveExams = cultureExams.filter(e => e.isPositive);
        if (positiveExams.length > 0) {
          const allOrgs = [];
          for (const e of positiveExams) {
            if (e.organisms) {
              allOrgs.push(...e.organisms);
            }
          }
          
          const consolidatedOrgs = consolidateOrganisms(allOrgs);
          const orgStrings = [];
          for (const org of consolidatedOrgs) {
            const atbParts = [];
            if (org.antibiogram.S.length) atbParts.push(`S: ${org.antibiogram.S.join(", ")}`);
            if (org.antibiogram.R.length) atbParts.push(`R: ${org.antibiogram.R.join(", ")}`);
            if (org.antibiogram.I.length) atbParts.push(`I: ${org.antibiogram.I.join(", ")}`);
            if (org.antibiogram.D.length) atbParts.push(`D: ${org.antibiogram.D.join(", ")}`);
            if (org.antibiogram.Obs.length) atbParts.push(`Obs: ${org.antibiogram.Obs.join(", ")}`);
            
            const atbLabel = atbParts.length > 0 ? ` (${atbParts.join(" | ")})` : "";
            const notesLabel = org.resistanceNotes && org.resistanceNotes.length > 0
              ? ` [${[...new Set(org.resistanceNotes)].join("; ")}]`
              : "";
            orgStrings.push(`${org.name}${atbLabel}${notesLabel}`);
          }

          outputLines.push(`${dateLabel}${mat}: ${orgStrings.join(" + ")}`);
        } else {
          outputLines.push(`${dateLabel}${mat}: Negativa`);
        }
      } else if (bacterioscopicos.length > 0) {
        const positiveBacs = bacterioscopicos.filter(e => e.isPositive);
        if (positiveBacs.length > 0) {
          let findings = [];
          for (const e of positiveBacs) {
            if (e.organisms) {
              findings.push(...e.organisms.map(o => typeof o === "string" ? o : o.name));
            }
          }
          findings = [...new Set(findings)];
          outputLines.push(`${dateLabel}${mat} (Bacterioscópico): ${findings.join(", ")}`);
        } else {
          outputLines.push(`${dateLabel}${mat} (Bacterioscópico): Ausência de Microrganismos`);
        }
      }
    }
  }

  return outputLines.join("\n");
}

function parseCultures(text, manualMaterial) {
  const blocks = segmentIntoBlocks(text);
  const parsedExams = [];

  for (const block of blocks) {
    if (!block.coletadoData) continue; // Descarta blocos de lixo (sem data de coleta)
    if (shouldIgnoreLine(block.titulo)) continue;

    const isCim = block.titulo && /CIM|CONCENTRAÇÃO INIBITÓRIA MÍNIMA/i.test(block.titulo);
    if (isCim) {
      parsedExams.push(parseCimBlock(block, manualMaterial));
    } else {
      parsedExams.push(parseCultureBlock(block, manualMaterial));
    }
  }

  return consolidateExams(parsedExams);
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

// ---------- Alternância de Tema (Light/Dark Mode) ----------
(function setupTheme() {
  const themeToggle = document.getElementById("themeToggle");
  let currentTheme = "light";
  
  try {
    currentTheme = localStorage.getItem("theme") || "light";
  } catch(e) {}

  if (currentTheme === "dark") {
    document.body.classList.add("dark-theme");
    if (themeToggle) {
      const icon = themeToggle.querySelector(".theme-icon");
      if (icon) icon.textContent = "☀️";
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark-theme");
      const isDark = document.body.classList.contains("dark-theme");
      
      try {
        localStorage.setItem("theme", isDark ? "dark" : "light");
      } catch(e) {}
      
      const icon = themeToggle.querySelector(".theme-icon");
      if (icon) icon.textContent = isDark ? "☀️" : "🌙";
    });
  }
})();
