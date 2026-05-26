const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const code = fs.readFileSync('./script.js', 'utf8');
const sandbox = {
  console,
  navigator: { clipboard: { writeText: async () => {} } },
  setTimeout,
  document: {
    querySelectorAll: () => [],
    getElementById: () => ({ addEventListener: () => {}, value: '', classList: { add(){}, remove(){} }, textContent: '' })
  }
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const { parseCultures } = sandbox;

const oldSingle = `Coletado em: 24/11/2025 19:17\nCULTURA AERÓBIA - SANGUE\n1 - Staphylococcus aureus\nANTIBIOGRAMA 1\nCLINDAMICINA 0,25 S\nOXACILINA >= 4 R\nLegenda\n`;
const r1 = parseCultures(oldSingle);
assert(/Staphylococcus aureus/.test(r1));
assert(/S: .*CLINDAMICINA/i.test(r1));
assert(/R: .*OXACILINA/i.test(r1));

const oldMulti = `CULTURA AERÓBIA - HEMOCULTURA\n1 - Enterococcus faecium AMPICILINA >= 32 R\n2 - Klebsiella pneumoniae complex\nANTIBIOGRAMA 1\nCEFTAZIDIMA\/AVIBACTAM 1 S\nMEROPENEM >= 16 R\nLegenda`;
const r2 = parseCultures(oldMulti);
assert(/Enterococcus faecium/i.test(r2));
assert(/Klebsiella pneumoniae complex/i.test(r2));

const brcast = `Microrganismos\n1 - Streptococcus pneumoniae\nAntibiogramas\n1 - Streptococcus pneumoniae\nAntimicrobiano Classificação/Categoria CIM\nCEFTRIAXONE Consultar observação\nCLINDAMICINA Sensível Dose Padrão\nLEVOFLOXACINA Sensível Aumentando a exposição\n`;
const r3 = parseCultures(brcast);
assert(/Streptococcus pneumoniae/i.test(r3));
assert(/CLINDAMICINA/i.test(r3));

const providedCase = `Coletado em: 27/04/2026 17:00
Liberado em: 02/05/2026
AMICACINA
4 S
1 - Enterococcus faecium
AMPICILINA
>= 32 R
2 - Klebsiella pneumoniae complex
AZTREONAM
>= 64 R
CEFTAZIDIMA/AVIBACTAM
1 S
GENTAMICINA
<= 1 S
Legenda
GENTAMICINA (HL)
R
LINEZOLIDA
1 S
MEROPENEM
>= 16 R
TIGECICLINA
<= 0,12 S 1 S
VANCOMICINA
>= 32 R`;
const r4 = parseCultures(providedCase);
assert(/Hemocultura:/i.test(r4));
assert(/Enterococcus faecium/i.test(r4));
assert(/Klebsiella pneumoniae/i.test(r4));
assert(/Linezolida/i.test(r4));
assert(/Ceftazidima\/Avibactam/i.test(r4));

console.log('OK: parser tests passed');
