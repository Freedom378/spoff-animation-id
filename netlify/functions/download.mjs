const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'access-control-allow-origin': '*'
};

const MAX_IDS = 25;
const MAX_TOTAL_BYTES = 8 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function parseIds(input) {
  const values = String(input || '')
    .split(/[\s,;]+/)
    .map(v => v.trim())
    .filter(Boolean);

  const ids = [];
  for (const value of values) {
    const match = value.match(/\d{5,20}/);
    if (match && !ids.includes(match[0])) ids.push(match[0]);
  }
  return ids;
}

function safeName(name, fallback) {
  const cleaned = String(name || fallback || 'Animation')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '');
  return (cleaned || fallback || 'Animation').slice(0, 100);
}

async function getDetails(id) {
  const endpoints = [
    `https://economy.roblox.com/v2/assets/${encodeURIComponent(id)}/details`,
    `https://develop.roblox.com/v1/assets/${encodeURIComponent(id)}`
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent': 'Mozilla/5.0 SpoffAnimationTool/2.0',
          'Accept': 'application/json'
        }
      });
      if (!response.ok) continue;
      const data = await response.json();
      return {
        name: data.Name || data.name || `Animation_${id}`,
        creator: data.Creator?.Name || data.Creator?.name || data.creator?.name || '',
        description: data.Description || data.description || ''
      };
    } catch {
      // Metadata is optional; the asset itself is what matters.
    }
  }

  return { name: `Animation_${id}`, creator: '', description: '' };
}

async function fetchAsset(id) {
  const endpoint = `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}`;
  const response = await fetch(endpoint, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'Mozilla/5.0 SpoffAnimationTool/2.0',
      'Accept': '*/*'
    }
  });

  if (!response.ok) {
    const message = response.status === 401 || response.status === 403
      ? 'Roblox menolak akses ke asset ini (privat, restricted, atau memerlukan izin).'
      : response.status === 404
        ? 'Asset tidak ditemukan.'
        : `Roblox tidak menyediakan file (HTTP ${response.status}).`;
    throw new Error(message);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  const head = new TextDecoder().decode(bytes.slice(0, 32));

  if (contentType.includes('application/json') || contentType.includes('text/html') || head.includes('{')) {
    throw new Error('Roblox mengembalikan metadata/halaman, bukan file asset yang bisa dipaketkan.');
  }

  return bytes;
}

// CRC-32 used by ZIP (no third-party dependency required on Netlify).
function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
}
const CRC_TABLE = makeCrcTable();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, n, true); return b; }
function u32(n) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n >>> 0, true); return b; }
function concat(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const encoder = new TextEncoder();

  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = file.data;
    const crc = crc32(data);

    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | Math.floor(now.getSeconds() / 2);
    const dosDate = ((Math.max(1980, now.getFullYear()) - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const local = concat([
      new Uint8Array([0x50,0x4b,0x03,0x04]),
      u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate),
      u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), name, data
    ]);
    chunks.push(local);

    const cd = concat([
      new Uint8Array([0x50,0x4b,0x01,0x02]),
      u16(20), u16(20), u16(0x0800), u16(0),
      u16(dosTime), u16(dosDate), u32(crc), u32(data.length), u32(data.length),
      u16(name.length), u16(0), u16(0), u16(0), u16(0),
      u32(0), u32(offset), name
    ]);
    central.push(cd);
    offset += local.length;
  }

  const centralStart = offset;
  const centralData = concat(central);
  const end = concat([
    new Uint8Array([0x50,0x4b,0x05,0x06]),
    u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralData.length), u32(centralStart), u16(0)
  ]);

  return concat([...chunks, centralData, end]);
}

function contentDisposition(filename) {
  const safe = filename.replace(/["\r\n]/g, '_');
  return `attachment; filename="${safe}"`;
}

export default async (request) => {
  if (request.method !== 'GET') return json({ ok: false, message: 'Method tidak didukung.' }, 405);

  const url = new URL(request.url);
  const ids = parseIds(url.searchParams.get('ids') || url.searchParams.get('id') || '');

  if (!ids.length) return json({ ok: false, message: 'Masukkan minimal satu Animation ID.' }, 400);
  if (ids.length > MAX_IDS) return json({ ok: false, message: `Maksimal ${MAX_IDS} ID per proses.` }, 400);

  const results = [];
  let totalBytes = 0;

  for (const id of ids) {
    try {
      const [details, data] = await Promise.all([getDetails(id), fetchAsset(id)]);
      totalBytes += data.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(`Ukuran total melebihi batas ${Math.round(MAX_TOTAL_BYTES / 1024 / 1024)} MB.`);
      }

      // The Roblox Asset Delivery response is preserved as-is. Animation assets
      // normally arrive as Roblox model/binary content, so this keeps the actual
      // animation/keyframe payload instead of merely creating an AnimationId reference.
      const filename = `${safeName(details.name, `Animation_${id}`)}_${id}.rbxm`;
      results.push({ id, filename, name: details.name, creator: details.creator, size: data.length, data });
    } catch (error) {
      results.push({ id, error: error?.message || 'Gagal mengambil asset.' });
    }
  }

  const good = results.filter(x => x.data);
  const failed = results.filter(x => !x.data);

  if (!good.length) {
    return json({
      ok: false,
      message: 'Tidak ada animation yang berhasil diambil.',
      results: results.map(({ id, error }) => ({ id, error }))
    });
  }

  if (good.length === 1 && ids.length === 1) {
    const item = good[0];
    return new Response(item.data, {
      status: 200,
      headers: {
        'content-type': 'application/octet-stream',
        'content-disposition': contentDisposition(item.filename),
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'x-animation-id': item.id
      }
    });
  }

  const zip = zipStore(good.map(x => ({ name: x.filename, data: x.data })));
  return new Response(zip, {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-disposition': contentDisposition(`Spoff_Animations_${Date.now()}.zip`),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
};
