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

// Ativa o comportamento dos botões de antibiótico (se existirem no HTML)
const antibioticButtons = document.querySelectorAll(".antibiotic-btn");

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

    // Se já temos texto formatado, reaplica o filtro na hora
    const outputEl = document.getElementById("output");
    if (lastFormattedText && outputEl) {
      const filtered = filterFormattedByAntibiotics(
        lastFormattedText,
        selectedAntibiotics
      );
      outputEl.value = filtered;
    }
  });
});

/**
 * Filtra o texto já formatado, removendo os antibióticos
 * que NÃO estão selecionados nas listas R:/S:/I:
 *
 * Exemplo de linha:
 * (21/11) Urina: Klebsiella (...) (R: Amicacina, Ciprofloxacina | S: Meropenem)
 */
function filterFormattedByAntibiotics(text, selectedSet) {
  // Se nada foi selecionado, não filtra nada
  if (!selectedSet || selectedSet.size === 0) {
    return text;
  }

  const lines = text.split("\n");
  const selectedList = Array.from(selectedSet); // nomes em minúsculo

  const filteredLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // só mexemos em linhas que têm parênteses com R:/S:/I:
    if (!/\(.*[SRI]\s*:\s*/.test(trimmed)) {
      return line;
    }

    // pega o último par de parênteses da linha
    const m = line.match(/^(.*?)(\(([^()]*)\))\s*$/);
    if (!m) return line;

    const before = m[1];    // tudo antes dos parênteses
    const inner = m[3];     // conteúdo dentro dos parênteses

    const parts = inner.split("|").map((p) => p.trim());

    const newParts = [];

    for (const part of parts) {
      // Ex: "R: Amicacina, Ciprofloxacina"
      const mPart = part.match(/^([SRI])\s*:\s*(.+)$/i);
      if (!mPart) {
        // não parece um bloco de antibiograma, mantém como está
        newParts.push(part);
        continue;
      }

      const cls = mPart[1]; // R / S / I
      const rest = mPart[2];

      const abNames = rest.split(",").map((x) => x.trim()).filter(Boolean);

      // mantemos apenas os ABs que estão selecionados
      const kept = abNames.filter((ab) =>
        selectedList.some(
          (sel) => ab.toLowerCase() === sel // match exato em minúsculo
        )
      );

      if (kept.length > 0) {
        newParts.push(`${cls}: ${kept.join(", ")}`);
      }
      // se não sobrou nada nessa classe, simplesmente removemos esse bloco
    }

    // se não sobrou nenhum bloco (R/S/I), removemos os parênteses
    if (newParts.length === 0) {
      return before.trimEnd();
    }

    const newInner = newParts.join(" | ");
    return `${before.trimEnd()} (${newInner})`;
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

    // Se teve organismos (cultura positiva)
    if (currentCulture.orgs && currentCulture.orgs.length > 0) {
      currentCulture.orgs.forEach((org) => {
        let line = "";

        if (date) {
          line += "(" + date + ") ";
        }

        line += material + ": " + org.name;

        if (org.ufc) {
          line += " (" + org.ufc + ")";
        }

        const parts = [];
        if (org.R && org.R.length) parts.push("R: " + org.R.join(", "));
        if (org.S && org.S.length) parts.push("S: " + org.S.join(", "));
        if (org.I && org.I.length) parts.push("I: " + org.I.join(", "));

        if (parts.length) {
          line += " (" + parts.join(" | ") + ")";
        }

        results.push(line);
      });
    } else if (currentCulture.resultSummary) {
      // Cultura negativa ou parcial
      let line = "";
      if (date) {
        line += "(" + date + ") ";
      }
      line += material + ": " + currentCulture.resultSummary;
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

    // Linha de resultado negativo da cultura:
    // "CULTURA AERÓBIA      Negativa    Negativa"
    if (
      currentCulture &&
      /^CULTURA\s+/i.test(line) &&
      /\bNegativa\b/i.test(line)
    ) {
      // Trata parcial negativa (micobactérias)
      if (/Parcial/i.test(line)) {
        currentCulture.resultSummary = "Parcialmente negativa";
      } else {
        // ex: "Cultura aeróbia negativa"
        const tipo = currentCulture.examType.replace(
          /^CULTURA/i,
          "Cultura"
        ).toLowerCase();
        currentCulture.resultSummary =
          tipo.charAt(0).toUpperCase() + tipo.slice(1) + " negativa";
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


// Linhas do antibiograma
if (currentCulture && currentCulture.parsingAntibiogram) {
  const tokens = line.split(/\s+/);
  if (tokens.length < 2) continue;

  // 1) identificar apenas classes S / R / I / D
  let classIndices = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^[SRID]$/i.test(tokens[i])) {
      classIndices.push({ idx: i, val: tokens[i].toUpperCase() });
    }
  }
  if (!classIndices.length) continue;

  const firstClassIdx = classIndices[0].idx;

  // 2) montar o nome do antibiótico SEM MIC
  let nameTokens = tokens.slice(0, firstClassIdx); // tudo antes do S/R/I/D

  // função auxiliar: detecta tokens que são MIC (número, número com vírgula, >=, <=)
  const isMicToken = (tok) => {
    if (!tok) return false;
    // >=, <=
    if (/^([<>]=?)$/.test(tok)) return true;
    // números tipo 4, 16, 0,25, 0.5
    if (/^\d+(?:[.,]\d+)?$/.test(tok)) return true;
    return false;
  };

  // remove possíveis MICs do final do nome (ex.: "Amicacina 4" -> "Amicacina")
  while (nameTokens.length > 1 && isMicToken(nameTokens[nameTokens.length - 1])) {
    nameTokens.pop();
  }

  let abName = nameTokens.join(" ").trim();

  // Coloca em "Title Case" (mantendo + e /)
  abName = toTitleCase(abName);

  const nOrgs = Math.max(1, currentCulture.orgs.length);

  for (let k = 0; k < Math.min(nOrgs, classIndices.length); k++) {
    const cls = classIndices[k].val;
    const org =
      currentCulture.orgs[k] ||
      (currentCulture.orgs[k] = {
        name: "Organismo " + (k + 1),
        ufc: null,
        R: [],
        S: [],
        I: [],
        D: [],
      });

    if (cls === "S") org.S.push(abName);
    else if (cls === "R") org.R.push(abName);
    else if (cls === "I") org.I.push(abName);
    else if (cls === "D") org.I.push(abName);
  }

  continue;
}
  

  // Finaliza o último bloco
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
