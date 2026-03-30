/**
 * Centre de Santé de Bibane (CSB) — Version Railway/Cloud
 */
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR   = path.join(__dirname, 'data');
const DB_FILE    = path.join(DATA_DIR, 'database.json');
const CODES_FILE = path.join(DATA_DIR, 'codes.json');
const AUDIT_FILE = path.join(DATA_DIR, 'audit.json');
const LIC_FILE   = path.join(DATA_DIR, 'licence.json');

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJSON(file, def) {
  try { if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8')); } catch(e) {}
  return def;
}
function writeJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

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
function loadDB() {
  const db = readJSON(DB_FILE, null);
  if (!db) return initDB();
  const def = initDB();
  Object.keys(def).forEach(k => { if (db[k] === undefined) db[k] = def[k]; });
  if (!db.pharmacie) db.pharmacie = def.pharmacie;
  if (!db.facturation) db.facturation = def.facturation;
  if (!db.parametres) db.parametres = def.parametres;
  return db;
}
function saveDB(db) { writeJSON(DB_FILE, db); }

const DEFAULT_CODES = {
  directeur:'DIR2026', accueil:'ACC001', medecin:'MED001',
  infirmier:'INF001', labo:'LAB001', pharmacien:'PHA001',
  comptabilite:'CPT001', concepteur:'DEV9999'
};
const USERS_META = {
  directeur:    { role:'directeur',    label:'Directeur',          couleur:'#0369a1', bg:'#e0f2fe' },
  accueil:      { role:'accueil',      label:'Accueil/Réception',  couleur:'#059669', bg:'#d1fae5' },
  medecin:      { role:'medecin',      label:'Médecin',            couleur:'#7c3aed', bg:'#ede9fe' },
  infirmier:    { role:'infirmier',    label:'Infirmier(e)',       couleur:'#0891b2', bg:'#cffafe' },
  labo:         { role:'labo',         label:'Laborantin',         couleur:'#d97706', bg:'#fef3c7' },
  pharmacien:   { role:'pharmacien',   label:'Pharmacien(ne)',     couleur:'#dc2626', bg:'#fee2e2' },
  comptabilite: { role:'comptabilite', label:'Comptabilité',       couleur:'#475569', bg:'#f1f5f9' },
  concepteur:   { role:'concepteur',   label:'Administrateur',     couleur:'#1e293b', bg:'#f8fafc' }
};
function loadCodes() { return { ...DEFAULT_CODES, ...readJSON(CODES_FILE, {}) }; }

function loadLicence() {
  return readJSON(LIC_FILE, { active:true, anneeValidite:new Date().getFullYear(), activePar:'Système', activeLe:new Date().toISOString().split('T')[0], raisonBlocage:'' });
}
function checkLicence() {
  const lic = loadLicence();
  const now = new Date();
  if (lic.anneeValidite < now.getFullYear()) return false;
  if (now > new Date(lic.anneeValidite, 11, 31, 23, 59, 59)) return false;
  return lic.active === true;
}

const sessions = {};
setInterval(() => { const n=Date.now(); Object.keys(sessions).forEach(t=>{ if(sessions[t].expiry<n) delete sessions[t]; }); }, 3600000);
function makeToken() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }
function getSession(req) { return sessions[req.headers['x-token']] || null; }

let auditLog = readJSON(AUDIT_FILE, []);
function addAudit(user, role, action, detail) {
  auditLog.unshift({ ts:new Date().toLocaleString('fr-FR'), user, role, action, detail });
  if (auditLog.length > 2000) auditLog = auditLog.slice(0, 2000);
  writeJSON(AUDIT_FILE, auditLog);
}

function auth(req, res, next) {
  if (!checkLicence()) return res.status(403).json({ ok:false, message:'Licence expirée', licenceExpired:true });
  const s = getSession(req);
  if (!s || s.expiry < Date.now()) return res.status(401).json({ ok:false, message:'Session expirée — reconnectez-vous' });
  req.session = s; next();
}
function authRole(...roles) {
  return (req, res, next) => {
    if (!checkLicence()) return res.status(403).json({ ok:false, message:'Licence expirée', licenceExpired:true });
    const s = getSession(req);
    if (!s) return res.status(401).json({ ok:false, message:'Non authentifié' });
    if (!roles.includes(s.role) && s.role !== 'concepteur') return res.status(403).json({ ok:false, message:'Accès refusé' });
    req.session = s; next();
  };
}

// ── LOGIN ─────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { identifiant, password } = req.body;
  const id = (identifiant||'').trim().toLowerCase();
  if (id !== 'concepteur' && !checkLicence()) {
    const lic = loadLicence();
    return res.json({ ok:false, message:`Licence expirée au 31/12/${lic.anneeValidite}.`, licenceExpired:true });
  }
  const codes = loadCodes();
  const extras = readJSON(path.join(DATA_DIR,'extra_comptes.json'), []);
  const allMeta = { ...USERS_META };
  extras.forEach(c => { allMeta[c.id]=c; codes[c.id]=c.mdp; });
  const meta = allMeta[id];
  if (!meta || codes[id] !== (password||'').trim()) return res.json({ ok:false, message:'Identifiant ou mot de passe incorrect' });
  const token = makeToken();
  sessions[token] = { ...meta, identifiant:id, expiry:Date.now()+12*3600*1000 };
  addAudit(meta.label, meta.role, 'Connexion', 'Accès accordé');
  res.json({ ok:true, token, user:{ ...meta, identifiant:id } });
});

app.post('/api/logout', auth, (req, res) => {
  addAudit(req.session.label, req.session.role, 'Déconnexion', 'OK');
  delete sessions[req.headers['x-token']];
  res.json({ ok:true });
});

// ── DB ────────────────────────────────────────────────────────
app.get('/api/db', auth, (req, res) => res.json({ ok:true, data:loadDB() }));

app.post('/api/db/:section', auth, (req, res) => {
  const { section } = req.params;
  const ok = ['patients','consultations','examens','rdv','commandes_phar','depenses','subventions','personnel','salaires','vaccination','planif_fam','cpn','parametres'];
  if (!ok.includes(section)) return res.status(400).json({ ok:false, message:'Section invalide' });
  const db = loadDB(); db[section] = req.body.data; saveDB(db);
  addAudit(req.session.label, req.session.role, 'Modif.'+section, Array.isArray(req.body.data)?req.body.data.length+' enreg.':'OK');
  res.json({ ok:true });
});

app.post('/api/db/:section/:sub', auth, (req, res) => {
  const { section, sub } = req.params;
  const ok = { pharmacie:['medicaments','milda','vaccins_stock'], facturation:['consultations','examens','pharmacie'] };
  if (!ok[section]||!ok[section].includes(sub)) return res.status(400).json({ ok:false, message:'Invalide' });
  const db = loadDB();
  if (!db[section]) db[section]={};
  db[section][sub] = req.body.data; saveDB(db);
  addAudit(req.session.label, req.session.role, 'Modif.'+section+'.'+sub, 'OK');
  res.json({ ok:true });
});

// ── CODES ─────────────────────────────────────────────────────
app.get('/api/codes', authRole('directeur','concepteur'), (req, res) => {
  const codes = loadCodes();
  if (req.session.role==='directeur') delete codes.concepteur;
  res.json({ ok:true, data:codes });
});
app.post('/api/codes', authRole('directeur','concepteur'), (req, res) => {
  const { userId, newPassword } = req.body;
  if (!userId||!newPassword||newPassword.length<4) return res.json({ ok:false, message:'Données invalides' });
  if (req.session.role==='directeur'&&userId==='concepteur') return res.status(403).json({ ok:false, message:'Interdit' });
  const codes = loadCodes(); codes[userId]=newPassword; writeJSON(CODES_FILE, codes);
  addAudit(req.session.label, req.session.role, 'Code modifié', userId);
  res.json({ ok:true });
});

// ── EXTRA COMPTES (laborantins) ───────────────────────────────
app.get('/api/extra_comptes', authRole('directeur','concepteur'), (req, res) => {
  res.json({ ok:true, data:readJSON(path.join(DATA_DIR,'extra_comptes.json'),[]) });
});
app.post('/api/extra_comptes', authRole('directeur','concepteur'), (req, res) => {
  const { id, label, mdp } = req.body;
  if (!id||!label||!mdp) return res.json({ ok:false, message:'Données incomplètes' });
  const codes = loadCodes();
  if (codes[id]||USERS_META[id]) return res.json({ ok:false, message:'Identifiant déjà utilisé' });
  const extras = readJSON(path.join(DATA_DIR,'extra_comptes.json'),[]);
  const n = { id, label, mdp, role:'labo', couleur:'#d97706', bg:'#fef3c7' };
  extras.push(n); codes[id]=mdp;
  writeJSON(path.join(DATA_DIR,'extra_comptes.json'), extras);
  writeJSON(CODES_FILE, codes);
  addAudit(req.session.label, req.session.role, 'Laborantin ajouté', id+' — '+label);
  res.json({ ok:true, compte:n });
});

// ── LICENCE ───────────────────────────────────────────────────
app.get('/api/licence', (req, res) => {
  const lic = loadLicence();
  res.json({ ok:true, data:lic, valid:checkLicence() });
});
app.post('/api/licence', (req, res) => {
  const { adminCode, action, anneeValidite, raison } = req.body;
  const codes = loadCodes();
  if (!adminCode||codes.concepteur!==adminCode) return res.status(403).json({ ok:false, message:'Code administrateur incorrect' });
  const lic = loadLicence();
  if (action==='activer') {
    const annee = parseInt(anneeValidite)||new Date().getFullYear();
    writeJSON(LIC_FILE, { active:true, anneeValidite:annee, activePar:'Administrateur', activeLe:new Date().toISOString().split('T')[0], raisonBlocage:'' });
    addAudit('Administrateur','concepteur','Licence activée','31/12/'+annee);
    res.json({ ok:true, message:'Licence activée jusqu\'au 31/12/'+annee });
  } else if (action==='desactiver') {
    writeJSON(LIC_FILE, { ...lic, active:false, raisonBlocage:raison||'Désactivation manuelle' });
    addAudit('Administrateur','concepteur','Licence désactivée',raison||'Manuel');
    res.json({ ok:true, message:'Système bloqué' });
  } else res.json({ ok:false, message:'Action invalide' });
});

// ── AUDIT ─────────────────────────────────────────────────────
app.post('/api/audit', auth, (req, res) => { addAudit(req.session.label, req.session.role, req.body.action, req.body.detail); res.json({ ok:true }); });
app.get('/api/audit', authRole('directeur','concepteur'), (req, res) => res.json({ ok:true, data:auditLog }));

// ── BACKUP ────────────────────────────────────────────────────
app.get('/api/backup', authRole('directeur','concepteur'), (req, res) => {
  const codes = loadCodes();
  if (req.session.role==='directeur') delete codes.concepteur;
  res.setHeader('Content-Disposition', `attachment; filename="CSB_backup_${new Date().toISOString().split('T')[0]}.json"`);
  res.json({ db:loadDB(), auditLog, codes, licence:loadLicence(), exportedAt:new Date().toISOString() });
});

// ── STATUS & HEALTH ───────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const db = loadDB(); const lic = loadLicence();
  res.json({ ok:true, nom:'Centre de Santé de Bibane', version:'2.0.0', licence:{ active:checkLicence(), anneeValidite:lic.anneeValidite }, stats:{ patients:db.patients.length, consultations:db.consultations.length, personnel:db.personnel.length }, sessions:Object.keys(sessions).length, uptime:Math.floor(process.uptime())+'s' });
});
app.get('/health', (req, res) => res.send('OK'));

// ─── Démarrage ────────────────────────────────────────────────
ensureDataDir();
app.listen(PORT, '0.0.0.0', () => {
  const lic = loadLicence();
  console.log(`✅  CSB Serveur démarré sur port ${PORT}`);
  console.log(`📋  Licence: ${lic.active ? 'ACTIVE' : 'INACTIVE'} — ${lic.anneeValidite}`);
  if (process.env.RAILWAY_STATIC_URL) console.log(`🌐  URL: https://${process.env.RAILWAY_STATIC_URL}`);
});
