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

    // só mexemos em linhas que têm R:/S:/I:/D: em algum parênteses
    if (!/\(.*[SRID]\s*:\s*/.test(trimmed)) {
      return line;
    }

    // Vamos tratar CADA par de parênteses da linha
    const newLine = line.replace(/\(([^()]*)\)/g, (full, inner) => {
      // inner = conteúdo dentro dos parênteses

      // se não tiver R:/S:/I:/D:, não é bloco de antibiograma → mantém
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
        // - antibióticos que NÃO têm botão (ex.: algum sem botão)
        // - antibióticos com botão que estejam selecionados
        const kept = abNames.filter((ab) => {
          const abLower = ab.toLowerCase();
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

    // Limpa espaços duplos que podem surgir ao remover parênteses
    return newLine.replace(/\s{2,}/g, " ").trimEnd();
  });

  return filteredLines.join("\n");
}





/* ===============================
   PARSER DAS CULTURAS
   =============================== */

function parseCultures(text) {
  const lines = text.split(/\r?\n/);

  let results = [];

  let currentResultDate = null; // dd/mm/aaaa
  let currentCollectionDate = null;

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

    // Linha com data/hora do resultado: 21/11/2025 14:45:20
    let mRes = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}:\d{2}/);
    if (mRes) {
      currentResultDate = mRes[1];
      continue;
    }

    // "Coletado em: 21/11/2025 20:35"
    let mCol = line.match(
      /^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/i
    );
    if (mCol) {
      currentCollectionDate = mCol[1];
      if (currentCulture) {
        currentCulture.collectionDate = currentCollectionDate;
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
        orgs: [],
        resultSummary: null,
        parsingAntibiogram: false,
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
    if (/^ANTIBIOGRAMA/i.test(line) && currentCulture) {
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
      // Usamos a linha original (com tabs), não só a versão "trim"
      let raw = rawLine;

      // Se a linha estiver vazia depois de limpar, pula
      if (!raw || !raw.trim()) continue;

      let cols;

      if (raw.includes("\t")) {
        // Caso 1: tabela com TABs → preserva colunas vazias
        cols = raw.split("\t").map((c) => c.trim());
      } else {
        // Caso 2: não tem TAB → usa blocos de 2+ espaços como separador
        cols = raw.trim().split(/\s{2,}/);
      }

      // precisa ter pelo menos nome + 1 coluna
      if (cols.length < 2) continue;

      // primeiro campo = nome do antibiótico
      let abName = (cols[0] || "").trim();
      if (!abName) continue;
      abName = toTitleCase(abName);

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
        const col = (cols[i] || "").trim();
        if (!col) continue;

        let cls = null;

        // 1) Regra especial: Colistina com "*" = SENSÍVEL
        if (abName.toLowerCase().includes("colistina") && col.includes("*")) {
          cls = "S";
        } else {
          // 2) Regra geral: procura S, R, I ou D na coluna
          const m = col.match(/\b([SRID])\b/i);
          if (!m) continue;
          cls = m[1].toUpperCase();
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

  // Finaliza o último bloco, se houver
  finalizeCulture();

  return results.join("\n");
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


