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


    function parseCultures(text) {
      const lines = text.split(/\r?\n/);

      let results = [];

      let currentResultDate = null;    // dd/mm/aaaa
      let currentCollectionDate = null;

      let currentCulture = null;       // bloco atual de cultura

      function ddmm(dateStr) {
        if (!dateStr) return "";
        const m = dateStr.match(/(\d{2})\/(\d{2})/);
        if (!m) return "";
        return m[1] + "/" + m[2];
      }

      function finalizeCulture() {
        if (!currentCulture) return;

        const date = ddmm(
          currentCulture.collectionDate ||
          currentCulture.resultDate
        );
      
        const rawMaterial = (currentCulture.material || currentCulture.examType || "Material não informado");
        const material = normalizeMaterial(rawMaterial);

        // Se teve organismos (cultura positiva)
        if (currentCulture.orgs && currentCulture.orgs.length > 0) {
          currentCulture.orgs.forEach(org => {
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
            if (org.P && org.P.length) parts.push("P: " + org.P.join(", "));
            if (org.N && org.N.length) parts.push("N: " + org.N.join(", "));

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
        let mCol = line.match(/^Coletado em:\s*(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/i);
        if (mCol) {
          currentCollectionDate = mCol[1];
          if (currentCulture) {
            currentCulture.collectionDate = currentCollectionDate;
          }
          continue;
        }

        // Início de novo bloco (Pedido / Divisão) encerra cultura anterior
        if (/^Pedido\s*:|^Pedido\s+/i.test(line) ||
            /^DIVISÃO DE LABORATÓRIO CENTRAL/i.test(line)) {
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
            parsingAntibiogram: false
          };
          continue;
        }

        // Linha de resultado negativo da cultura:
        // "CULTURA AERÓBIA      Negativa    Negativa"
        if (currentCulture && /^CULTURA\s+/i.test(line) && /\bNegativa\b/i.test(line)) {
          // Trata parcial negativa (micobactérias)
          if (/Parcial/i.test(line)) {
            currentCulture.resultSummary = "Parcialmente negativa";
          } else {
            // ex: "Cultura aeróbia negativa"
            const tipo = currentCulture.examType
              .replace(/^CULTURA/i, "Cultura")
              .toLowerCase();
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
              P: [],
              N: []
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
        if (/^Legenda/i.test(line) && currentCulture && currentCulture.parsingAntibiogram) {
          currentCulture.parsingAntibiogram = false;
          continue;
        }

        // Linhas do antibiograma
        if (currentCulture && currentCulture.parsingAntibiogram) {
          const tokens = line.split(/\s+/);
          if (tokens.length < 2) continue;

          // procura letras de interpretação S/R/I/P/N/D
          let classIndices = [];
          for (let i = 0; i < tokens.length; i++) {
            if (/^[SRIPND]$/i.test(tokens[i])) {
              classIndices.push({ idx: i, val: tokens[i].toUpperCase() });
            }
          }
          if (!classIndices.length) continue;

          const firstClassIdx = classIndices[0].idx;
          const nameParts = tokens.slice(0, Math.max(1, firstClassIdx - 1));
          let abName = nameParts.join(" ");

          // Remove símbolos >= ou <= que grudaram no nome
          abName = abName.replace(/\s*[<>]=/g, "").trim();

          // Coloca em "Title Case"
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
                P: [],
                N: []
              });

            if (cls === "S") org.S.push(abName);
            else if (cls === "R") org.R.push(abName);
            else if (cls === "I") org.I.push(abName);
            else if (cls === "P") org.P.push(abName);
            else if (cls === "N") org.N.push(abName);
          }
          continue;
        }
      }

      // Finaliza o último bloco
      finalizeCulture();

      return results.join("\n");
    }

    document.getElementById("processBtn").addEventListener("click", function () {
      const raw = document.getElementById("input").value;
      const out = parseCultures(raw);
      document.getElementById("output").value = out;
    });
