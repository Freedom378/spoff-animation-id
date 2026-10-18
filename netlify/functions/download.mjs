// Only proxies assets Roblox makes available through its public asset-delivery endpoint.
// It does not bypass authentication, ownership checks, moderation, or privacy restrictions.
export default async (request) => {
  const cors = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  if (request.method !== 'GET') return new Response(JSON.stringify({ ok:false, message:'Method tidak didukung.' }), { status:405, headers:cors });
  const url = new URL(request.url);
  const id = url.searchParams.get('id') || '';
  const type = url.searchParams.get('type') || 'animation';
  if (!/^\d{5,20}$/.test(id)) return new Response(JSON.stringify({ ok:false, message:'ID harus berupa angka yang valid.' }), { status:400, headers:cors });
  if (!['animation','audio'].includes(type)) return new Response(JSON.stringify({ ok:false, message:'Jenis aset tidak valid.' }), { status:400, headers:cors });
  try {
    const endpoint = `https://assetdelivery.roblox.com/v1/asset/?id=${encodeURIComponent(id)}`;
    const upstream = await fetch(endpoint, { redirect:'follow', headers:{ 'User-Agent':'Mozilla/5.0 SpoffAssetTool/1.0', 'Accept':'*/*' } });
    if (!upstream.ok) {
      const message = upstream.status === 401 || upstream.status === 403
        ? 'Roblox menolak akses ke aset ini (mungkin privat, terbatas, atau memerlukan izin).'
        : upstream.status === 404 ? 'Aset tidak ditemukan.' : `Roblox tidak menyediakan file (HTTP ${upstream.status}).`;
      return new Response(JSON.stringify({ ok:false, message }), { status:200, headers:cors });
    }
    const contentType = (upstream.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json') || contentType.includes('text/html')) {
      return new Response(JSON.stringify({ ok:false, message:'Endpoint mengembalikan metadata atau halaman, bukan file aset yang bisa diunduh langsung.' }), { status:200, headers:cors });
    }
    // Do not buffer/re-host the binary in the function; return a public Roblox asset URL for the browser.
    // The frontend uses the original endpoint to avoid memory limits on larger audio assets.
    return new Response(JSON.stringify({ ok:true, downloadUrl:endpoint }), { status:200, headers:cors });
  } catch {
    return new Response(JSON.stringify({ ok:false, message:'Tidak dapat menghubungi Roblox Asset Delivery. Coba lagi nanti.' }), { status:200, headers:cors });
  }
};
