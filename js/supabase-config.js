// ============================================================
// CONFIGURACIÓN SUPABASE — Distribuidora de Avila
// Pegá aquí los datos de tu proyecto (ver instrucciones en admin.html)
// ============================================================

const SUPABASE_URL     = 'https://nfzmfxeysnpqapalpgpb.supabase.co';  // sin /rest/v1/ al final
const SUPABASE_ANON_KEY = 'sb_publishable_plad-JmIbItPxp5LUNlKjQ_IB_hxq3Q'; // clave anon/public del proyecto

(function () {
  const configured = typeof supabase !== 'undefined' &&
    SUPABASE_URL !== 'PEGAR-AQUI' && SUPABASE_ANON_KEY !== 'PEGAR-AQUI' &&
    SUPABASE_URL.startsWith('https://');

  window.SUPABASE_CONFIGURED = configured;

  if (configured) {
    try {
      window.db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
      window.SUPABASE_CONFIGURED = false;
      console.error('Error inicializando Supabase:', e);
    }
  } else {
    console.warn('Supabase no configurado — usando almacenamiento local (solo este dispositivo).');
  }
})();
