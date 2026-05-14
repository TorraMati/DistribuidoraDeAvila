// ============================================================
// CONFIGURACIÓN FIREBASE — Distribuidora de Avila
// Pegá aquí los datos de tu proyecto (ver instrucciones en admin.html)
// ============================================================

const firebaseConfig = {
  apiKey:            "PEGAR-AQUI",
  authDomain:        "PEGAR-AQUI",
  projectId:         "PEGAR-AQUI",
  storageBucket:     "PEGAR-AQUI",
  messagingSenderId: "PEGAR-AQUI",
  appId:             "PEGAR-AQUI"
};

(function () {
  const allFilled = typeof firebase !== 'undefined' &&
    Object.values(firebaseConfig).every(v => v && v !== 'PEGAR-AQUI');

  window.FIREBASE_CONFIGURED = allFilled;

  if (allFilled) {
    try {
      if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
      window.db = firebase.firestore();
    } catch (e) {
      window.FIREBASE_CONFIGURED = false;
      console.error('Error Firebase:', e);
    }
  } else {
    console.warn('Firebase no configurado — usando almacenamiento local (solo este dispositivo).');
  }
})();
