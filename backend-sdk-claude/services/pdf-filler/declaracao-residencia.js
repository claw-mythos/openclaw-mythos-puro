const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const TEMPLATE_PATH = path.resolve(
  __dirname,
  '../../../bridge/preencher/DECLARAÇÃO DO DETRAN.pdf'
);
const COORDS_PATH = path.join(__dirname, 'coords.json');

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

function loadCoords() {
  return JSON.parse(fs.readFileSync(COORDS_PATH, 'utf8'));
}

function splitPhone(raw) {
  if (!raw) return { ddd: '', num: '' };
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length <= 2) return { ddd: digits, num: '' };
  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  let num = rest;
  if (rest.length === 9) num = `${rest.slice(0, 5)}-${rest.slice(5)}`;
  else if (rest.length === 8) num = `${rest.slice(0, 4)}-${rest.slice(4)}`;
  return { ddd, num };
}

function formatCPF(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 11) return String(raw);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatCEP(raw) {
  if (!raw) return '';
  const d = String(raw).replace(/\D/g, '');
  if (d.length !== 8) return String(raw);
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function resolveDate(input) {
  if (!input || !input.data) {
    const now = new Date();
    return { dia: String(now.getDate()), mes: MESES[now.getMonth()], ano: String(now.getFullYear()) };
  }
  if (typeof input.data === 'string') {
    const m = input.data.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return { dia: String(parseInt(m[3], 10)), mes: MESES[parseInt(m[2], 10) - 1], ano: m[1] };
    }
  }
  return {
    dia: String(input.dataDia || ''),
    mes: input.dataMes || '',
    ano: String(input.dataAno || ''),
  };
}

function normalizeFields(input = {}) {
  const tel = splitPhone(input.telefone);
  const cel = splitPhone(input.celular);
  const date = resolveDate(input);

  return {
    nome: input.nome || '',
    nomeSocial: input.nomeSocial || '',
    documentoId: input.documentoId || input.rg || '',
    orgaoExpedidor: input.orgaoExpedidor || '',
    cpf: formatCPF(input.cpf),
    nacionalidade: input.nacionalidade || '',
    naturalidade: input.naturalidade || '',
    telefoneDDD: tel.ddd,
    telefone: tel.num,
    celularDDD: cel.ddd,
    celular: cel.num,
    email: input.email || '',
    endereco: input.endereco || '',
    numero: input.numero ? String(input.numero) : '',
    complemento: input.complemento || '',
    cep: formatCEP(input.cep),
    uf: input.uf || '',
    cidade: input.cidade || '',
    bairro: input.bairro || '',
    dataDia: date.dia,
    dataMes: date.mes,
    dataAno: date.ano,
  };
}

async function loadImageBytes(source) {
  if (!source) return null;
  if (Buffer.isBuffer(source)) return source;
  if (source instanceof Uint8Array) return Buffer.from(source);
  if (typeof source === 'string') {
    const dataUrlMatch = source.match(/^data:image\/[a-z]+;base64,(.+)$/i);
    if (dataUrlMatch) return Buffer.from(dataUrlMatch[1], 'base64');
    if (/^[A-Za-z0-9+/=\s]+$/.test(source) && source.length > 100) {
      try { return Buffer.from(source, 'base64'); } catch (_) {}
    }
    if (fs.existsSync(source)) return fs.readFileSync(source);
  }
  return null;
}

async function fillDeclaracao(input, { debug = false } = {}) {
  const coords = loadCoords();
  const data = normalizeFields(input);

  const bytes = fs.readFileSync(TEMPLATE_PATH);
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.getPages()[0];

  const drawText = (value, pos) => {
    if (value === undefined || value === null || value === '') return;
    page.drawText(String(value), {
      x: pos.x,
      y: pos.y,
      size: coords.fontSize,
      font,
      color: rgb(0, 0, 0),
    });
  };

  for (const [field, pos] of Object.entries(coords.fields)) {
    drawText(data[field], pos);
  }

  if (input.assinatura) {
    const sigBytes = await loadImageBytes(input.assinatura);
    if (sigBytes) {
      const isPng = sigBytes[0] === 0x89 && sigBytes[1] === 0x50;
      const img = isPng ? await pdf.embedPng(sigBytes) : await pdf.embedJpg(sigBytes);
      const sigCoords = coords.signature || { x: 235, y: 400, width: 200, height: 35 };
      const ratio = img.height / img.width;
      const width = sigCoords.width;
      const height = sigCoords.height || width * ratio;
      page.drawImage(img, {
        x: sigCoords.x,
        y: sigCoords.y,
        width,
        height,
      });
    }
  }

  if (debug) {
    const { width, height } = page.getSize();
    for (let x = 0; x <= width; x += 50) {
      page.drawLine({
        start: { x, y: 0 },
        end: { x, y: height },
        thickness: 0.2,
        color: rgb(1, 0, 0),
        opacity: 0.3,
      });
      page.drawText(String(x), { x: x + 1, y: 2, size: 5, font, color: rgb(1, 0, 0) });
    }
    for (let y = 0; y <= height; y += 50) {
      page.drawLine({
        start: { x: 0, y },
        end: { x: width, y },
        thickness: 0.2,
        color: rgb(1, 0, 0),
        opacity: 0.3,
      });
      page.drawText(String(y), { x: 2, y: y + 1, size: 5, font, color: rgb(1, 0, 0) });
    }
    for (const [field, pos] of Object.entries(coords.fields)) {
      page.drawCircle({ x: pos.x, y: pos.y, size: 1.5, color: rgb(0, 0.5, 1) });
      page.drawText(field, { x: pos.x + 3, y: pos.y + 2, size: 5, font, color: rgb(0, 0.3, 0.8) });
    }
  }

  return Buffer.from(await pdf.save());
}

module.exports = { fillDeclaracao, MESES };
