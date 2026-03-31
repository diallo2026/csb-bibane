/**
 * Centre de Santé de Bibane (CSB) — Version Railway
 * Licence stockée via variable d'environnement pour persistance
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJSON(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch(e) {}
  return def;
}
function writeJSON(file, data) {
  ensureDir();
  try { fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8'); }
  catch(e) { console.error('writeJSON error:', e.message); }
}

// ── Base de données EN MÉMOIRE ─────────────────────────────────
function initDB() {
  return {
    patients:[], consultations:[], examens:[], rdv:[],
    pharmacie:{ medicaments:[], milda:[], vaccins_stock:[] },
    commandes_phar:[],
    facturation:{ consultations:[], examens:[], pharmacie:[] },
    depenses:[], subventions:[], personnel:[], salaires:[],
    vaccination:[], planif_fam:[], cpn:[],
    parametres:{ repartition:{ pctDir:0.50, pctSal:0.25, pctCharge:0.15, pctDon:0.10 } }
  };
}

let DB_MEMORY = (() => {
  const saved = readJSON(path.join(DATA_DIR, 'database.json'), null);
  if (!saved) return initDB();
  const def = initDB();
  Object.keys(def).forEach(k => { if (saved[k] === undefined) saved[k] = def[k]; });
  ['pharmacie','facturation','parametres'].forEach(k => { if (!saved[k]) saved[k] = def[k]; });
  return saved;
})();

function loadDB() { return DB_MEMORY; }
function saveDB(db) { DB_MEMORY = db; writeJSON(path.join(DATA_DIR,'database.json'), db); }

// ── Codes EN MÉMOIRE ──────────────────────────────────────────
const DEFAULT_CODES = {
  directeur:'DIR2026', accueil:'ACC001', medecin:'MED001',
  infirmier:'INF001', labo:'LAB001', pharmacien:'PHA001',
  comptabilite:'CPT001', concepteur:'DEV9999'
};
let CODES_MEMORY = { ...DEFAULT_CODES, ...readJSON(path.join(DATA_DIR,'codes.json'), {}) };
function loadCodes() { return CODES_MEMORY; }
function saveCodes(c) { CODES_MEMORY = c; writeJSON(path.join(DATA_DIR,'codes.json'), c); }

const USERS_META = {
  directeur:    { role:'directeur',    label:'Directeur',       couleur:'#0369a1', bg:'#e0f2fe' },
  accueil:      { role:'accueil',      label:'Accueil',         couleur:'#059669', bg:'#d1fae5' },
  medecin:      { role:'medecin',      label:'Medecin',         couleur:'#7c3aed', bg:'#ede9fe' },
  infirmier:    { role:'infirmier',    label:'Infirmier(e)',    couleur:'#0891b2', bg:'#cffafe' },
  labo:         { role:'labo',         label:'Laborantin',      couleur:'#d97706', bg:'#fef3c7' },
  pharmacien:   { role:'pharmacien',   label:'Pharmacien(ne)',  couleur:'#dc2626', bg:'#fee2e2' },
  comptabilite: { role:'comptabilite', label:'Comptabilite',    couleur:'#475569', bg:'#f1f5f9' },
  concepteur:   { role:'concepteur',   label:'Administrateur',  couleur:'#1e293b', bg:'#f8fafc' }
};

// ── LICENCE — stockée en mémoire persistante ──────────────────
// Sur Railway: utilise process.env.LICENCE_DATA si disponible
// Sinon: fichier local
let LICENCE_MEMORY = (() => {
  // Priorité 1: variable d'environnement (persiste entre redémarrages Railway)
  if (process.env.LICENCE_DATA) {
    try { return JSON.parse(process.env.LICENCE_DATA); } catch(e) {}
  }
  // Priorité 2: fichier local
  const saved = readJSON(path.join(DATA_DIR,'licence.json'), null);
  if (saved) return saved;
  // Par défaut: active pour l'année en cours
  return { active:true, anneeValidite:new Date().getFullYear(), raisonBlocage:'' };
})();

function loadLicence() { return LICENCE_MEMORY; }
function saveLicence(lic) {
  LICENCE_MEMORY = lic;
  writeJSON(path.join(DATA_DIR,'licence.json'), lic);
  // Afficher dans les logs Railway pour que l'admin puisse copier la valeur
  console.log('=== LICENCE MIS A JOUR ===');
  console.log('LICENCE_DATA='+JSON.stringify(lic));
  console.log('=== Pour rendre permanent sur Railway: ===');
  console.log('Variables > Ajouter: LICENCE_DATA = '+JSON.stringify(lic));
  console.log('========================');
}
function checkLicence() {
  const lic = LICENCE_MEMORY;
  if (!lic.active) return false;
  const now = new Date();
  if (lic.anneeValidite < now.getFullYear()) return false;
  if (now > new Date(lic.anneeValidite, 11, 31, 23, 59, 59)) return false;
  return true;
}

// ── Comptes extra ─────────────────────────────────────────────
let EXTRA_COMPTES = readJSON(path.join(DATA_DIR,'extra_comptes.json'), []);
EXTRA_COMPTES.forEach(c => { USERS_META[c.id]=c; CODES_MEMORY[c.id]=c.mdp; });

// ── Sessions ──────────────────────────────────────────────────
const sessions = {};
setInterval(() => {
  const n=Date.now();
  Object.keys(sessions).forEach(t=>{ if(sessions[t].expiry<n) delete sessions[t]; });
}, 3600000);
function makeToken() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function getSession(req) { return sessions[req.headers['x-token']]||null; }

// ── Audit ─────────────────────────────────────────────────────
let AUDIT = readJSON(path.join(DATA_DIR,'audit.json'), []);
function addAudit(user, role, action, detail) {
  AUDIT.unshift({ ts:new Date().toLocaleString('fr-FR'), user, role, action, detail });
  if (AUDIT.length>2000) AUDIT=AUDIT.slice(0,2000);
  writeJSON(path.join(DATA_DIR,'audit.json'), AUDIT);
}

// ── Middleware ────────────────────────────────────────────────
function auth(req, res, next) {
  if (!checkLicence()) return res.status(403).json({ ok:false, message:'Licence expiree', licenceExpired:true });
  const s=getSession(req);
  if (!s||s.expiry<Date.now()) return res.status(401).json({ ok:false, message:'Session expiree' });
  req.session=s; next();
}
function authRole(...roles) {
  return (req, res, next) => {
    if (!checkLicence()) return res.status(403).json({ ok:false, message:'Licence expiree', licenceExpired:true });
    const s=getSession(req);
    if (!s) return res.status(401).json({ ok:false, message:'Non authentifie' });
    if (!roles.includes(s.role)&&s.role!=='concepteur') return res.status(403).json({ ok:false });
    req.session=s; next();
  };
}

// ══════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════

app.post('/api/login', (req, res) => {
  const { identifiant, password } = req.body;
  const id=(identifiant||'').trim().toLowerCase();
  if (id!=='concepteur'&&!checkLicence()) {
    const lic=loadLicence();
    return res.json({ ok:false, message:'Licence expiree au 31/12/'+lic.anneeValidite, licenceExpired:true });
  }
  const codes=loadCodes();
  const meta=USERS_META[id];
  if (!meta||codes[id]!==(password||'').trim()) return res.json({ ok:false, message:'Identifiant ou mot de passe incorrect' });
  const token=makeToken();
  sessions[token]={ ...meta, identifiant:id, expiry:Date.now()+12*3600*1000 };
  addAudit(meta.label, meta.role, 'Connexion', 'OK');
  res.json({ ok:true, token, user:{ ...meta, identifiant:id } });
});

app.post('/api/logout', auth, (req,res) => {
  delete sessions[req.headers['x-token']];
  res.json({ ok:true });
});

app.get('/api/db', auth, (req,res) => res.json({ ok:true, data:loadDB() }));

app.post('/api/db/:section', auth, (req,res) => {
  const { section }=req.params;
  const ok=['patients','consultations','examens','rdv','commandes_phar','depenses','subventions','personnel','salaires','vaccination','planif_fam','cpn','parametres'];
  if (!ok.includes(section)) return res.status(400).json({ ok:false });
  const db=loadDB(); db[section]=req.body.data; saveDB(db);
  res.json({ ok:true });
});

app.post('/api/db/:section/:sub', auth, (req,res) => {
  const { section,sub }=req.params;
  const ok={ pharmacie:['medicaments','milda','vaccins_stock'], facturation:['consultations','examens','pharmacie'] };
  if (!ok[section]||!ok[section].includes(sub)) return res.status(400).json({ ok:false });
  const db=loadDB(); if(!db[section])db[section]={}; db[section][sub]=req.body.data; saveDB(db);
  res.json({ ok:true });
});

app.get('/api/codes', authRole('directeur','concepteur'), (req,res) => {
  const codes={ ...loadCodes() };
  if (req.session.role==='directeur') delete codes.concepteur;
  res.json({ ok:true, data:codes });
});
app.post('/api/codes', authRole('directeur','concepteur'), (req,res) => {
  const { userId,newPassword }=req.body;
  if (!userId||!newPassword||newPassword.length<4) return res.json({ ok:false, message:'Invalide' });
  if (req.session.role==='directeur'&&userId==='concepteur') return res.status(403).json({ ok:false });
  const codes=loadCodes(); codes[userId]=newPassword; saveCodes(codes);
  res.json({ ok:true });
});

app.get('/api/extra_comptes', authRole('directeur','concepteur'), (req,res) => res.json({ ok:true, data:EXTRA_COMPTES }));
app.post('/api/extra_comptes', authRole('directeur','concepteur'), (req,res) => {
  const { id,label,mdp }=req.body;
  if (!id||!label||!mdp) return res.json({ ok:false });
  const codes=loadCodes();
  if (codes[id]||USERS_META[id]) return res.json({ ok:false, message:'Deja utilise' });
  const n={ id,label,mdp,role:'labo',couleur:'#d97706',bg:'#fef3c7' };
  EXTRA_COMPTES.push(n); USERS_META[id]=n; codes[id]=mdp; saveCodes(codes);
  writeJSON(path.join(DATA_DIR,'extra_comptes.json'), EXTRA_COMPTES);
  res.json({ ok:true, compte:n });
});

// ── LICENCE ───────────────────────────────────────────────────
app.get('/api/licence', (req,res) => {
  res.json({ ok:true, data:loadLicence(), valid:checkLicence() });
});

app.post('/api/licence', (req,res) => {
  const { adminCode, action, anneeValidite, raison }=req.body;
  const codes=loadCodes();
  const codeAttendu=codes.concepteur||'DEV9999';

  console.log('LICENCE REQUEST - action:', action, '| code fourni:', adminCode, '| code attendu:', codeAttendu);

  if (!adminCode||adminCode.trim()!==codeAttendu) {
    console.log('CODE INCORRECT');
    return res.status(403).json({ ok:false, message:'Code administrateur incorrect. Utilisez: '+codeAttendu });
  }

  if (action==='activer') {
    const annee=parseInt(anneeValidite)||new Date().getFullYear();
    const newLic={ active:true, anneeValidite:annee, raisonBlocage:'', activeLe:new Date().toISOString().split('T')[0] };
    saveLicence(newLic);
    addAudit('Administrateur','concepteur','Licence activee','31/12/'+annee);
    res.json({ ok:true, message:'Licence activee pour '+annee, licence:newLic });

  } else if (action==='desactiver') {
    const r=raison||'Desactivation manuelle';
    const newLic={ active:false, anneeValidite:loadLicence().anneeValidite, raisonBlocage:r, desactiveLe:new Date().toISOString().split('T')[0] };
    saveLicence(newLic);
    addAudit('Administrateur','concepteur','Licence desactivee',r);
    // Invalider TOUTES les sessions sauf concepteur
    Object.keys(sessions).forEach(t => {
      if (sessions[t].role!=='concepteur') delete sessions[t];
    });
    res.json({ ok:true, message:'Systeme bloque', licence:newLic });

  } else {
    res.json({ ok:false, message:'Action invalide' });
  }
});

app.post('/api/audit', auth, (req,res) => { addAudit(req.session.label,req.session.role,req.body.action,req.body.detail); res.json({ ok:true }); });
app.get('/api/audit', authRole('directeur','concepteur'), (req,res) => res.json({ ok:true, data:AUDIT }));

app.get('/api/backup', authRole('directeur','concepteur'), (req,res) => {
  const codes={ ...loadCodes() };
  if (req.session.role==='directeur') delete codes.concepteur;
  res.setHeader('Content-Disposition','attachment; filename="CSB_backup_'+new Date().toISOString().split('T')[0]+'.json"');
  res.json({ db:loadDB(), audit:AUDIT, codes, licence:loadLicence(), exportedAt:new Date().toISOString() });
});

app.get('/api/status', (req,res) => {
  const lic=loadLicence();
  res.json({ ok:true, licence:{ active:checkLicence(), anneeValidite:lic.anneeValidite, raisonBlocage:lic.raisonBlocage }, sessions:Object.keys(sessions).length, uptime:Math.floor(process.uptime())+'s' });
});
app.get('/health', (req,res) => res.send('OK'));

// ── Démarrage ─────────────────────────────────────────────────
ensureDir();
app.listen(PORT, '0.0.0.0', () => {
  const lic=loadLicence();
  console.log('✅ CSB Serveur demarre — Port:', PORT);
  console.log('📋 Licence:', lic.active?'ACTIVE':'INACTIVE', '— Annee:', lic.anneeValidite);
  console.log('🔑 Code concepteur:', loadCodes().concepteur);
  if (!process.env.LICENCE_DATA) {
    console.log('⚠️  IMPORTANT: Pour rendre le blocage permanent sur Railway,');
    console.log('   ajoutez la variable LICENCE_DATA dans Railway > Variables');
  }
});
