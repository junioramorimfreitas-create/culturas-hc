// Deixa "AMICACINA" -> "Amicacina", "SULFA + TRIMETHOPRIM" -> "Sulfa + Trimethoprim"
function toTitleCase(str) {
  return str
    .toLowerCase()
    .replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

// Padroniza material (remove traços, vírgulas inúteis e coloca Title Case)
function normalizeMaterial(str) {
  if (!str) return "";

  // Remove duplicações como ",URINA..." e partes repetidas após vírgula
  str = str.split(",")[0];

  // Remove " - " e junta só o que importa
  str = str.replace(/\s*-\s*/g, " ");

  // Remove múltiplos espaços
  str = str.replace(/\s+/g, " ").trim();

  // Coloca em Title Case
  return str
    .toLowerCase()
    .replace(/\S+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/* ===============================
   CONTROLE DE ANTIBIÓTICOS
   =============================== */

// guardamos os antibióticos selecionados em minúsculo
const selectedAntibiotics = new Set();
// guardamos o texto formatado completo para poder refiltrar sem recalcular
let lastFormattedText = "";

function applyAntibioticFilter() {
  const outputEl = document.getElementById("output");
  if (lastFormattedText && outputEl) {
    const filtered = filterFormattedByAntibiotics(
      lastFormattedText,
      selectedAntibiotics
    );
    outputEl.value = filtered;
  }
}

// Ativa o comportamento dos botões de antibiótico (se existirem no HTML)
const antibioticButtons = document.querySelectorAll(
  ".antibiotic-btn[data-antibiotico]"
);

// Conjunto com todos os antibióticos que têm botão na tela
const antibioticsWithButtons = new Set();
antibioticButtons.forEach((btn) => {
  const label = (btn.dataset.antibiotico || "").trim().toLowerCase();
  if (label) {
    antibioticsWithButtons.add(label);
  }
});

function setAllAntibiotics(selected) {
  selectedAntibiotics.clear();

  antibioticButtons.forEach((btn) => {
    const label = (btn.dataset.antibiotico || "").trim();
    if (!label) return;

    const key = label.toLowerCase();
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

    const key = label.toLowerCase();

    if (selectedAntibiotics.has(key)) {
      // desmarca
      selectedAntibiotics.delete(key);
      btn.classList.remove("selected");
    } else {
      // marca
      selectedAntibiotics.add(key);
      btn.classList.add("selected");
    }

    applyAntibioticFilter();
  });
});

const selectAllBtn = document.getElementById("selectAllAntibiotics");
if (selectAllBtn) {
  selectAllBtn.addEventListener("click", () => setAllAntibiotics(true));
}

const deselectAllBtn = document.getElementById("deselectAllAntibiotics");
if (deselectAllBtn) {
  deselectAllBtn.addEventListener("click", () => setAllAntibiotics(false));
}

// Deixa todos os antibióticos selecionados por padrão ao carregar a página
if (antibioticButtons.length > 0) {
  setAllAntibiotics(true);
}




/**
 * Filtra o texto já formatado, removendo os antibióticos
 * que NÃO estão selecionados nas listas R:/S:/I:/D:
 *
 * Exemplo de linha:
 * (21/11) Urina: Klebsiella (...) (R: Amicacina, Ciprofloxacina | S: Meropenem)
 */

function filterFormattedByAntibiotics(text, selectedSet) {
  // Se não houver Set (caso extremo), não filtra nada
  if (!selectedSet) {
    return text;
  }

  const lines = text.split("\n");

  const filteredLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // só mexemos em linhas que têm padrão de antibiograma em algum lugar
    if (!/\(.*[SRID]\s*:\s*/.test(trimmed)) {
      return line;
    }

    // 👉 1) substitui (hl) por um marcador temporário para evitar parênteses aninhados
    const placeholder = "__HL__";
    let working = line.replace(/\(hl\)/gi, placeholder);

    // 👉 2) trata CADA par de parênteses da linha "sanitizada"
    const newLine = working.replace(/\(([^()]*)\)/g, (full, inner) => {
      // inner = conteúdo dentro dos parênteses

      // se não tiver R:/S:/I:/D:, não é bloco de antibiograma → mantém como está
      if (!/[SRID]\s*:\s*/.test(inner)) {
        return full;
      }

      const parts = inner.split("|").map((p) => p.trim());
      const newParts = [];

      for (const part of parts) {
        // Ex: "R: Amicacina, Ciprofloxacina" ou "D: Piperacilina/tazobactam"
        const mPart = part.match(/^([SRID])\s*:\s*(.+)$/i);
        if (!mPart) {
          // não parece um bloco de antibiograma, mantém como está
          newParts.push(part);
          continue;
        }

        const cls = mPart[1]; // R / S / I / D
        const rest = mPart[2];

        const abNames = rest
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);

        // mantemos:
        // - antibióticos que NÃO têm botão
        // - antibióticos com botão que estejam selecionados
        const kept = abNames.filter((ab) => {
          let abLower = ab.toLowerCase();

          // se veio "Gentamicina __HL__", tira o marcador só para comparar
          abLower = abLower.replace(/\s*__hl__\s*$/i, "");

          const hasButton = antibioticsWithButtons.has(abLower);

          // se não tem botão → nunca filtramos fora
          if (!hasButton) return true;

          // se tem botão → só aparece se estiver selecionado
          return selectedSet.has(abLower);
        });

        if (kept.length > 0) {
          newParts.push(`${cls}: ${kept.join(", ")}`);
        }
        // se não sobrou nada nessa classe, simplesmente removemos esse bloco
      }

      // se não sobrou nenhum bloco (R/S/I/D) dentro desses parênteses → removemos os parênteses
      if (newParts.length === 0) {
        return "";
      }

      const newInner = newParts.join(" | ");
      return `(${newInner})`;
    });

    // 👉 3) devolve o marcador "__HL__" para "(hl)" para exibir bonitinho
    const restored = newLine.replace(/__HL__/g, "(HL)");

    // 👉 4) limpa espaços duplos que podem surgir
    return restored.replace(/\s{2,}/g, " ").trimEnd();
  });

  return filteredLines.join("\n");
}




/* ===============================
   PARSER DAS CULTURAS
   =============================== */

function parseCultures(text) {
  const cleanedText = stripAdministrativeNoise(text || "");
  const layout = detectMicrobiologyLayout(cleanedText);
  const lines = cleanedText.split(/\r?\n/);

  let results = [];

  let bacterioMap = {};      // chave → CGP / BGN / BGP / Leveduras
  let currentBactExam = null;
  let parsingBactExam = false;

function finalizeBactExam() {
  if (currentBactExam && currentBactExam.matchKey && currentBactExam.gramCode) {
    bacterioMap[currentBactExam.matchKey] = currentBactExam.gramCode;
  }
  currentBactExam = null;
  parsingBactExam = false;
}

  let currentResultDate = null; // dd/mm/aaaa
  let currentCollectionDate = null;
  let currentCollectionTime = null;
  let currentCollectionStamp = null;

  let currentCulture = null; // bloco atual de cultura

  function ddmm(dateStr) {
    if (!dateStr) return "";
    const m = dateStr.match(/(\d{2})\/(\d{2})/);
    if (!m) return "";
    return m[1] + "/" + m[2];
  }

  // Remove acentos e coloca em minúsculo
  function normalizePlain(str) {
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  // Extrai o tipo de cultura (aeróbia, anaeróbia, fungos, micobactérias)
  function getCultureType(examType) {
    if (!examType) return "";
    const s = normalizePlain(examType);

    // pega "anaerob" (anaerobios, anaerobia…), importante tester anareob ANTES de aerob
    if (s.includes("anaerob")) {
      return "anaeróbia";
    }

    // pega tudo que comece com "aerob" (aerobia, aerobios, aerobica…)
    if (s.includes("aerob")) {
      return "aeróbia";
    }

    // fungo / fungos
    if (s.includes("fung")) {
      return "fungos";
    }

    // micobactérias
    if (s.includes("micobact")) {
      return "micobactérias";
    }

    return "";
  }



 function finalizeCulture() {
  if (!currentCulture) return;

   // Se não achou gramCode dentro da cultura, tenta buscar no mapa
if (
  !currentCulture.gramCode &&
  currentCulture.matchKey &&
  bacterioMap[currentCulture.matchKey]
) {
  currentCulture.gramCode = bacterioMap[currentCulture.matchKey];
}


  const date = ddmm(
    currentCulture.collectionDate || currentCulture.resultDate
  );

  const rawMaterial =
    currentCulture.material ||
    currentCulture.examType ||
    "Material não informado";
  const material = normalizeMaterial(rawMaterial);

  // pega o tipo da cultura (aeróbia, anaeróbia, fungos, micobactérias)
  const cultureType = getCultureType(currentCulture.examType);

  // monta o rótulo final do material: "Partes Moles - aeróbia"
  let materialLabel = material;
  if (cultureType) {
    materialLabel += " - " + cultureType; // deixa o tipo em minúsculo mesmo
  }

  // É cultura de sangue?
  const isBlood =
    /sangue/i.test(rawMaterial) ||
    /sangue/i.test(currentCulture.material || "") ||
    /sangue/i.test(currentCulture.examType || "");

  // Se teve organismos (cultura positiva)
  if (currentCulture.orgs && currentCulture.orgs.length > 0) {
    // 👉 Em vez de uma linha por organismo, montamos UMA linha com todos, separados por " + "
    const orgSegments = currentCulture.orgs.map((org) => {
      let seg = org.name;

      if (org.ufc) {
        seg += " (" + org.ufc + ")";
      }

      const parts = [];
      if (org.R && org.R.length) parts.push("R: " + org.R.join(", "));
      if (org.S && org.S.length) parts.push("S: " + org.S.join(", "));
      if (org.I && org.I.length) parts.push("I: " + org.I.join(", "));
      if (org.D && org.D.length) parts.push("D: " + org.D.join(", "));

      if (parts.length) {
        seg += " (" + parts.join(" | ") + ")";
      }

      return seg;
    });

    let line = "";
    if (date) {
      line += "(" + date + ") ";
    }

    // material + TODOS os microrganismos juntos
    line += materialLabel + ": " + orgSegments.join(" + ");

    if (isBlood && currentCulture.detectionTime) {
      line += " (Tempo de detecção: " + currentCulture.detectionTime + ")";
    }

    results.push(line);

  } else if (currentCulture.resultSummary) {
    // Cultura negativa, positiva sem identificação, ou parcial
    let line = "";
    if (date) {
      line += "(" + date + ") ";
    }
    line += materialLabel + ": " + currentCulture.resultSummary;

    if (isBlood && currentCulture.detectionTime) {
      line += " (Tempo de detecção: " + currentCulture.detectionTime + ")";
    }

    results.push(line);
  }

  currentCulture = null;
}


  for (let rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (/^Microrganismos$/i.test(line) && !currentCulture) {
      currentCulture = {
        examType: "CULTURA",
        material: "Hemocultura",
        resultDate: currentResultDate,
        collectionDate: currentCollectionDate,
        collectionStamp: currentCollectionStamp || null,
        matchKey: "",
        orgs: [],
        resultSummary: null,
        parsingAntibiogram: false,
        parsingBacterioscopy: false,
        gramCode: null,
        detectionTime: null
      };
      continue;
    }

    // Linha com data/hora do resultado: 21/11/2025 14:45:20
    let mRes = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}/);
    if (mRes) {
      currentResultDate = mRes[1];
      continue;
    }

// "Coletado em: 24/11/2025 19:17"
let mCol = line.match(
  /^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i
);
if (mCol) {
  currentCollectionDate = mCol[1];         // 24/11/2025
  currentCollectionTime = mCol[2];         // 19:17
  currentCollectionStamp =
    currentCollectionDate + " " + currentCollectionTime;

  if (currentCulture) {
    currentCulture.collectionDate = currentCollectionDate;
    currentCulture.collectionStamp = currentCollectionStamp;
  }
  continue;
}
    

    // Início de novo bloco (Pedido / Divisão) encerra cultura anterior
    if (
      /^Pedido\s*:|^Pedido\s+/i.test(line) ||
      /^DIVISÃO DE LABORATÓRIO CENTRAL/i.test(line)
    ) {
      finalizeCulture();
      continue;
    }

    // Cabeçalho de BACTERIOSCÓPICO DE HEMOCULTURA
let mBactHeader = line.match(
  /^BACTERIOSC[ÓO]PICO DE HEMOCULTURA\s+(.+?)\s*-\s*(.+)$/i
);
if (mBactHeader) {
  // sempre finaliza qualquer bacterioscopia anterior
  finalizeBactExam();

  const bactTypeRaw = (mBactHeader[1] || "").trim();     // "ANAERÓBIA"
  const bactTailRaw = (mBactHeader[2] || "").trim();     // "SANGUE PERIFÉRICO - MSE,..."

  const bactCultureType = getCultureType("CULTURA " + bactTypeRaw);
  const bactMaterialNorm = normalizeMaterial(bactTailRaw); // "Sangue Periférico Mse" etc.
  const bactStamp = currentCollectionStamp || "";

  const matchKey =
    (bactCultureType || "").toLowerCase() +
    " | " +
    bactMaterialNorm.toLowerCase() +
    " | " +
    bactStamp;

  currentBactExam = {
    examType: bactTypeRaw,
    material: bactMaterialNorm,
    collectionStamp: bactStamp,
    matchKey,
    gramCode: null
  };

  parsingBactExam = true;
  continue;
}

    // Lendo o conteúdo do bacterioscópico
if (parsingBactExam && currentBactExam) {

  if (/cocos\s+gram\s+positiv/i.test(line)) {
    currentBactExam.gramCode = "CGP";
    continue;
  }
  if (/bacilos\s+gram\s+negativ/i.test(line)) {
    currentBactExam.gramCode = "BGN";
    continue;
  }
  if (/bacilos\s+gram\s+positiv/i.test(line)) {
    currentBactExam.gramCode = "BGP";
    continue;
  }
  if (/levedur/i.test(line)) {
    currentBactExam.gramCode = "Leveduras";
    continue;
  }

  // Fim do bloco de bacterioscopia
  if (
    /^Coloração de GRAM/i.test(line) ||
    /^Material Biológico/i.test(line) ||
    /^DIVISÃO DE LABORATÓRIO CENTRAL/i.test(line) ||
    /^Pedido\s*:|^Pedido\s+/i.test(line) ||
    /^CULTURA\s+/i.test(line)
  ) {
    finalizeBactExam();
    // NÃO continue: a mesma linha pode ser interpretada por outro bloco
  }
}



    // Cabeçalho da cultura: "CULTURA AERÓBIA - URINA DE JATO MEDIO - ,URINA..."
    let mCultHeader = line.match(/^CULTURA.*?-\s*(.+?)(?:\s*[,;-].*)?$/i);
    if (mCultHeader) {
      // Mas só se for linha de cabeçalho mesmo (tem " - ")
      if (!line.includes(" - ")) continue;

      
      finalizeCulture();

      // examType = primeira parte antes do primeiro "-"
      const firstDash = line.indexOf("-");
      const examType = line.substring(0, firstDash).trim(); // ex: "CULTURA AERÓBIA"
      const material = (mCultHeader[1] || "").trim();

    currentCulture = {
  examType,
  material,
  resultDate: currentResultDate,
  collectionDate: currentCollectionDate,

  // carimbo de coleta: data + hora
  collectionStamp: currentCollectionStamp || null,

  // chave de casamento cultura ↔ bacterioscópico
  matchKey:
    (getCultureType(examType) || "").toLowerCase() +
    " | " +
    normalizeMaterial(material).toLowerCase() +
    " | " +
    (currentCollectionStamp || ""),

  orgs: [],
  resultSummary: null,
  parsingAntibiogram: false,
  parsingBacterioscopy: false, // vamos parar de usar isso aqui já-já
  gramCode: null,              // CGP / BGN / BGP / Leveduras
  detectionTime: null          // você já preenche em outro lugar
};
continue;

    }

       // Linha de resultado positivo/negativo da cultura:
    // ex: "CULTURA AERÓBIA      Negativa    Negativa"
    //     "CULTURA PARA ANAERÓBIOS      Positiva    Negativa"
    if (
      currentCulture &&
      /^CULTURA\s+/i.test(line) &&
      (/\bPositiva\b/i.test(line) || /\bNegativa\b/i.test(line))
    ) {
      const hasPos = /\bPositiva\b/i.test(line);
      const hasNeg = /\bNegativa\b/i.test(line);

      // Trata parcial negativa
      if (hasNeg && /Parcial/i.test(line)) {
        currentCulture.resultSummary = "parcial negativa";

      } else {
        // se tiver qualquer "Positiva", consideramos cultura positiva
        const status = hasPos ? "positiva" : "negativa";
        currentCulture.resultSummary = status;
      }

      continue;
    }


    // Identificação de microrganismos: "1 - Klebsiella pneumoniae complex"
    if (currentCulture) {
      let mOrg = line.match(/^\d+\s*-\s*(.+)$/);
      if (mOrg) {
        currentCulture.orgs.push({
          name: mOrg[1].trim(),
          ufc: null,
          R: [],
          S: [],
          I: [],
          D: [],
        });
        continue;
      }

      // Linha com UFC/mL para o último organismo
      if (/UFC\/mL/i.test(line) && currentCulture.orgs.length > 0) {
        const uMatch = line.match(/\(\s*([^)]*UFC\/mL)[^)]*\)/i);
        if (uMatch) {
          currentCulture.orgs[currentCulture.orgs.length - 1].ufc =
            uMatch[1].trim();
        }
        continue;
      }
    }

    // Início do antibiograma
    if ((/^ANTIBIOGRAMA/i.test(line) || /^Antibiogramas?/i.test(line)) && currentCulture) {
      currentCulture.parsingAntibiogram = true;
      continue;
    }

    // Fim do antibiograma (Legenda)
    if (
      /^Legenda/i.test(line) &&
      currentCulture &&
      currentCulture.parsingAntibiogram
    ) {
      currentCulture.parsingAntibiogram = false;
      continue;
    }


    // Tempo de detecção (culturas de sangue)
    // Ex: "T. DETECÇÂO      02 Dias - 03 Horas 49 Minutos 13 Segundos"
    if (currentCulture && /^T\.\s*DETEC/i.test(line)) {
      const mDet = line.match(
        /(\d+)\s*Dias?.*?(\d+)\s*Horas?.*?(\d+)\s*Minutos?/i
      );
      if (mDet) {
        const d = parseInt(mDet[1], 10) || 0;
        const h = parseInt(mDet[2], 10) || 0;
        const min = parseInt(mDet[3], 10) || 0;

        let detLabel = "";
        if (d > 0) detLabel += d + "d ";
        if (h > 0) detLabel += h + "h ";
        detLabel += min + "min";

        currentCulture.detectionTime = detLabel.trim();
      }
      continue;
    }


      // Linhas do antibiograma
    if (currentCulture && currentCulture.parsingAntibiogram) {
      if (/^Antimicrobiano\s+Classifica/i.test(line)) continue;
      if (/^Microrganismos$/i.test(line)) continue;

      // Novo layout (BrCAST): "AB Sensível Dose Padrão [CIM opcional]"
      const brcast = parseBrcastAntibioticLine(line);
      if (brcast && currentCulture.orgs.length > 0) {
        const org = currentCulture.orgs[currentCulture.orgs.length - 1];
        const cls = normalizeInterpretation(brcast.interpretation);
        const abLabel = brcast.mic ? `${brcast.name} ${brcast.mic}` : brcast.name;
        if (cls === "S") org.S.push(abLabel);
        else if (cls === "R") org.R.push(abLabel);
        else if (cls === "I") org.I.push(abLabel);
        else if (cls === "D") org.D.push(abLabel);
        continue;
      }

      // Layout antigo misturando organismo + primeiro antibiótico
      const mixed = line.match(/^(\d+)\s*-\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 .\/()\-+]+?)\s{1,}([A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ0-9\/+ .\-]+(?:\b[SRID]\b|Sensível|Resistente|Consultar))/i);
      if (mixed) {
        const orgName = mixed[2].replace(/\s+/g, " ").trim();
        currentCulture.orgs.push({
          name: orgName,
          ufc: null,
          R: [],
          S: [],
          I: [],
          D: [],
        });
        rawLine = mixed[3];
      }

      // Usamos a linha original (com tabs), não só a versão "trim"
      let raw = rawLine;

      // Se a linha estiver vazia depois de limpar, pula
      if (!raw || !raw.trim()) continue;

      let cols;
      let parsedInline = null;

      if (raw.includes("\t")) {
        // Caso 1: tabela com TABs → preserva colunas vazias
        cols = raw.split("\t").map((c) => c.trim());
      } else {
        // Caso 2: não tem TAB → usa blocos de 2+ espaços como separador
        cols = raw.trim().split(/\s{2,}/);
        if (cols.length < 2) {
          const mInline = raw
            .trim()
            .match(/^(.+?)\s+((?:<=|>=|=|<|>)?\s*[\d.,*]+)?\s*([SRIDPN])$/i);
          if (mInline) {
            parsedInline = {
              abName: mInline[1].trim(),
              cls: normalizeInterpretation(mInline[3]),
            };
          }
        }
      }

      // precisa ter pelo menos nome + 1 coluna
      if (!parsedInline && cols.length < 2) continue;

      // primeiro campo = nome do antibiótico
      let abName = parsedInline ? parsedInline.abName : (cols[0] || "").trim();
      if (!abName) continue;
      abName = abName.replace(/\s+/g, " ").trim();

      // número de microrganismos: usa o que já foi lido (1 -, 2 -, 3 -, ...),
      // mas limita a no máximo 5
      let nOrgs = currentCulture.orgs.length;
      if (!nOrgs) {
        // fallback: se por algum motivo ainda não tiver orgs,
        // infere pelo número de colunas (nome + N colunas)
        nOrgs = Math.min(cols.length - 1, 5);
      }
      const maxOrgs = Math.min(nOrgs, 5);

      // colunas 1..maxOrgs → organismos 0..maxOrgs-1
      for (let i = 1; i <= maxOrgs; i++) {
        if (parsedInline) {
          const org = currentCulture.orgs[0];
          if (!org || !parsedInline.cls) break;
          if (parsedInline.cls === "S") org.S.push(abName);
          else if (parsedInline.cls === "R") org.R.push(abName);
          else if (parsedInline.cls === "I") org.I.push(abName);
          else if (parsedInline.cls === "D") org.D.push(abName);
          break;
        }
        const col = (cols[i] || "").trim();
        if (!col) continue;

        let cls = null;

        // 1) Regra especial: Colistina com "*" = SENSÍVEL
        if (abName.toLowerCase().includes("colistina") && col.includes("*")) {
          cls = "S";
        } else {
          // 2) Regra geral: procura S, R, I ou D na coluna
          const m = col.match(/\b([SRIDPN])\b/i);
          if (!m) continue;
          cls = normalizeInterpretation(m[1].toUpperCase());
        }

        const orgIndex = i - 1;

        // garante que o organismo existe
        const org =
          currentCulture.orgs[orgIndex] ||
          (currentCulture.orgs[orgIndex] = {
            name: "Organismo " + (orgIndex + 1),
            ufc: null,
            R: [],
            S: [],
            I: [],
            D: [],
          });

        if (cls === "S") org.S.push(abName);
        else if (cls === "R") org.R.push(abName);
        else if (cls === "I") org.I.push(abName);
        else if (cls === "D") org.D.push(abName);
      }

      continue;
    }








  } // fim do for que percorre as linhas

  // Finaliza bacterioscopia pendente
  finalizeBactExam();
  // Finaliza o último bloco, se houver
  finalizeCulture();

  // Fallback para layout antigo "empilhado" (antibiótico em uma linha e resultado na linha seguinte)
  if (results.length === 0) {
    const stacked = parseStackedAntibiogramLayout(cleanedText);
    if (stacked) results.push(stacked);
  }

  if (layout === "new") {
    return enrichWithMetadata(results.join("\n"), cleanedText);
  }
  return enrichWithMetadata(results.join("\n"), cleanedText);
}

function parseStackedAntibiogramLayout(rawText) {
  const lines = (rawText || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const orgs = [];
  for (const l of lines) {
    const m = l.match(/^(\d+)\s*-\s*(.+)$/);
    if (m) {
      orgs.push({
        idx: parseInt(m[1], 10),
        name: m[2].trim().replace(/\s+complex$/i, ""),
        R: [],
        S: [],
        I: [],
        D: [],
      });
    }
  }
  if (!orgs.length) return null;

  const hasLegend = lines.some((l) => /^Legenda$/i.test(l));
  const hasStackedValues = lines.some((l) => /^([<>=]+\s*)?[\d.,]+\s+[SRIDPN](\s+[SRIDPN])*$/.test(l) || /^[SRIDPN](\s+[SRIDPN])+$/.test(l));
  if (!hasLegend && !hasStackedValues) return null;

  let currentAb = null;
  for (const l of lines) {
    if (/^Legenda$/i.test(l)) continue;
    if (/^(Coletado em:|Liberado em:|M[ée]todo:|Resultado|Valores de Referência|HIST[ÓO]RICO)/i.test(l)) continue;
    if (/^\d+\s*-\s*/.test(l)) continue;
    if (/^[SRIDPN]\s*-\s*/i.test(l)) continue;

    const vm = l.match(/^([<>=]+\s*)?[\d.,*]+\s+([SRIDPN])(?:\s+([SRIDPN]))?$/i) || l.match(/^([SRIDPN])(?:\s+([SRIDPN]))$/i);
    if (vm && currentAb) {
      const c1 = normalizeInterpretation(vm[2] || vm[1]);
      const c2 = normalizeInterpretation(vm[3] || vm[2] || null);
      if (c1 && orgs[0]) orgs[0][c1].push(currentAb);
      if (c2 && orgs[1]) orgs[1][c2].push(currentAb);
      continue;
    }

    if (/^[A-ZÁÀÂÃÉÈÊÍÌÎÓÒÔÕÚÙÛÇ0-9\/+() .-]{3,}$/i.test(l)) {
      currentAb = l.replace(/\s+/g, " ").trim();
    }
  }

  const dateCol = (rawText.match(/Coletado em:\s*(\d{2}\/\d{2}\/\d{4})\s+(\d{2}:\d{2})/i) || []);
  const stamp = dateCol[1] ? `(${dateCol[1].slice(0,6)}${dateCol[1].slice(8)} ${dateCol[2] || ""}) ` : "";
  const material = /cateter/i.test(rawText) ? "HMC cateter" : "Hemocultura";

  const formatOrg = (o) => {
    const p = [];
    if (o.S.length) p.push(`S: ${o.S.map(toTitleCase).join(", ")}`);
    if (o.R.length) p.push(`R: ${o.R.map(toTitleCase).join(", ")}`);
    if (o.I.length) p.push(`I: ${o.I.map(toTitleCase).join(", ")}`);
    if (o.D.length) p.push(`D: ${o.D.map(toTitleCase).join(", ")}`);
    return `${o.name} (${p.join(" | ")})`;
  };

  return `${stamp}${material}: ${orgs.map(formatOrg).join(" + ")}`.trim();
}

function detectMicrobiologyLayout(text) {
  if (!text) return "unknown";
  const hasNew =
    /Microrganismos/i.test(text) &&
    /Antibiogramas?/i.test(text) &&
    /Classifica[çc][ãa]o\/Categoria/i.test(text);
  const hasOld =
    /ANTIBIOGRAMA\s+\d+/i.test(text) ||
    /Legenda/i.test(text) ||
    /\bS\s*-\s*Sens[ií]vel\b/i.test(text);
  if (hasNew) return "new";
  if (hasOld) return "old";
  return "unknown";
}

function normalizeInterpretation(value) {
  const v = (value || "").toString().trim().toLowerCase();
  if (!v) return null;
  if (v === "s" || v.includes("sensível dose padrão")) return "S";
  if (v === "i" || v.includes("aumentando a expos")) return "I";
  if (v === "r" || v.includes("resistente")) return "R";
  if (v === "d" || v.includes("dose depend")) return "D";
  if (v.includes("consultar observa")) return "D";
  if (v === "p" || v.includes("positivo")) return "S";
  if (v === "n" || v.includes("negativo")) return "R";
  return null;
}

function parseBrcastAntibioticLine(line) {
  const clean = (line || "").replace(/\s+/g, " ").trim();
  if (!clean) return null;
  const categoryPatterns = [
    "Sensível Dose Padrão",
    "Sensivel Dose Padrao",
    "Sensível Aumentando a exposição",
    "Sensivel Aumentando a exposicao",
    "Resistente",
    "Consultar observação",
    "Consultar observacao"
  ];
  for (const cat of categoryPatterns) {
    const idx = clean.toLowerCase().indexOf(cat.toLowerCase());
    if (idx > 0) {
      const namePart = clean.slice(0, idx).trim();
      const tail = clean.slice(idx + cat.length).trim();
      const micMatch = tail.match(/^((?:<=|>=|=|<|>)?\s*[\d.,]+)\b/);
      return {
        name: namePart,
        interpretation: cat,
        mic: micMatch ? micMatch[1].replace(/\s+/g, "") : null,
      };
    }
  }
  return null;
}

function stripAdministrativeNoise(text) {
  const blocked = [
    /^M[ée]dicos Respons[áa]veis/i,
    /^Os resultados dos exames laboratoriais/i,
    /^Consulte Manual de Exames/i,
    /^Material Biol[oó]gico entregue/i,
    /\bCRM\s*\d+/i
  ];
  return (text || "")
    .split(/\r?\n/)
    .filter((l) => !blocked.some((rx) => rx.test((l || "").trim())))
    .join("\n");
}

function enrichWithMetadata(output, rawText) {
  const collected = (rawText.match(/Coletado em:\s*([^\n]+)/i) || [])[1];
  const released = (rawText.match(/Liberado em:\s*([^\n]+)/i) || [])[1];
  const examCode = (rawText.match(/C[oó]digo do exame:\s*([^\n]+)/i) || [])[1];
  const method = (rawText.match(/M[ée]todo:\s*([^\n]+)/i) || [])[1];
  const partial = /Resultado\s+PARCIAL|Favor aguardar resultado final/i.test(rawText);
  const obsBlock = extractClinicalObservations(rawText);

  const headerParts = [];
  if (collected) headerParts.push(`Coletado em ${collected.trim()}`);
  if (released) headerParts.push(`Liberado em ${released.trim()}`);
  if (examCode) headerParts.push(`Código ${examCode.trim()}`);
  if (method) headerParts.push(`Método ${method.trim()}`);
  if (partial) headerParts.push("Resultado parcial");
  if (obsBlock) headerParts.push(`Observações: ${obsBlock}`);

  if (!headerParts.length) return output;
  if (!output || !output.trim()) return `[${headerParts.join(" | ")}]`;
  return output;
}

function extractClinicalObservations(rawText) {
  const clinical = [];
  const rules = [
    /carbapenemase[^\n.]*/ig,
    /\bKPC\b[^\n.]*/ig,
    /oxacilina[^\n.]*/ig,
    /daptomicina[^\n.]*/ig,
    /polimixina|colistina[^\n.]*/ig,
    /consultar\s+CIM[^\n.]*/ig,
    /Instituto Adolfo Lutz[^\n.]*/ig,
    /Observa[çc][õo]es?:\s*([^\n]+)/ig
  ];
  for (const rx of rules) {
    const matches = rawText.match(rx) || [];
    for (const m of matches) clinical.push(m.replace(/\s+/g, " ").trim());
  }
  return [...new Set(clinical)].join(" | ");
}



/* ===============================
   BOTÃO PRINCIPAL "PROCESSAR"
   =============================== */

document.getElementById("processBtn").addEventListener("click", function () {
  const raw = document.getElementById("input").value;
  const formatted = parseCultures(raw);

  // guarda o resultado completo antes de filtrar
  lastFormattedText = formatted;

  // aplica filtro de antibiótico (se tiver algo selecionado)
  const finalText = filterFormattedByAntibiotics(
    formatted,
    selectedAntibiotics
  );

  document.getElementById("output").value = finalText;
});


// Botão COPIAR //
document.getElementById("copyBtn").addEventListener("click", async () => {
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
  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(() => {
    toast.classList.remove("show");
  }, 2000); // 2 segundos
}
