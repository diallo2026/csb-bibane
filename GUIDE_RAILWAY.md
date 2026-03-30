# Guide de déploiement sur Railway (Internet gratuit)

## Ce que vous obtiendrez
Un lien comme : https://csb-bibane-production.up.railway.app
Accessible partout dans le monde, 24h/24, depuis n'importe quel appareil.

---

## ÉTAPE 1 — Créer un compte GitHub (si pas encore fait)

1. Allez sur : https://github.com
2. Cliquez "Sign up"
3. Inscrivez-vous avec votre adresse Gmail
4. Vérifiez votre email et confirmez

---

## ÉTAPE 2 — Mettre les fichiers sur GitHub

### Option A — Via le site GitHub (sans installer quoi que ce soit)

1. Connectez-vous sur https://github.com
2. Cliquez le bouton vert **"New"** (ou "+" en haut à droite → "New repository")
3. Nommez le dépôt : `csb-bibane`
4. Cochez **"Public"**
5. Cliquez **"Create repository"**

Ensuite, uploadez les fichiers :
6. Cliquez **"uploading an existing file"**
7. Glissez-déposez TOUS les fichiers du dossier `csb_server` :
   - `server.js`
   - `package.json`
   - Le dossier `public/` (avec `index.html` dedans)
8. Cliquez **"Commit changes"**

---

## ÉTAPE 3 — Déployer sur Railway

1. Allez sur : https://railway.app
2. Cliquez **"Start a New Project"**
3. Choisissez **"Deploy from GitHub repo"**
4. Connectez votre compte GitHub (bouton "Connect GitHub")
5. Sélectionnez le dépôt **csb-bibane**
6. Railway détecte automatiquement que c'est Node.js
7. Cliquez **"Deploy Now"**

**Attendez 2-3 minutes** — Railway installe et lance le serveur.

---

## ÉTAPE 4 — Obtenir votre lien public

1. Dans Railway, cliquez sur votre projet
2. Allez dans l'onglet **"Settings"**
3. Section **"Networking"** → cliquez **"Generate Domain"**
4. Vous obtenez un lien comme :
   `https://csb-bibane-production.up.railway.app`

**Ce lien est votre application !**
Donnez-le à tout votre personnel — ils l'ouvrent dans leur navigateur.

---

## Identifiants de connexion

| Identifiant  | Mot de passe | Rôle                  |
|-------------|-------------|----------------------|
| directeur   | DIR2026     | Directeur            |
| accueil     | ACC001      | Accueil / Réception  |
| medecin     | MED001      | Médecin              |
| infirmier   | INF001      | Infirmier(e)         |
| labo        | LAB001      | Laborantin           |
| pharmacien  | PHA001      | Pharmacien(ne)       |
| comptabilite| CPT001      | Comptabilité         |
| concepteur  | DEV9999     | Administrateur       |

---

## Plan gratuit Railway — Ce qu'il inclut

- ✅ 500 heures/mois gratuites (suffisant pour fonctionner 24h/24)
- ✅ Domaine HTTPS gratuit (lien sécurisé)
- ✅ Mises à jour automatiques quand vous modifiez GitHub
- ✅ Logs en temps réel

---

## Sauvegarder vos données

**IMPORTANT** : Railway peut réinitialiser le stockage lors des redémarrages.
Faites des sauvegardes régulières :

1. Connectez-vous en tant que **concepteur** ou **directeur**
2. Allez dans **Admin système**
3. Cliquez **"Exporter toutes les données (JSON)"**
4. Gardez ce fichier sur votre ordinateur

---

## Mettre à jour l'application

Si vous recevez une nouvelle version du fichier HTML :
1. Allez sur votre dépôt GitHub
2. Cliquez sur `public/index.html`
3. Cliquez l'icône crayon (modifier)
4. Collez le nouveau contenu
5. Cliquez "Commit changes"
6. Railway redéploie automatiquement en 2 minutes !

---

## En cas de problème

- **L'application ne charge pas** : Attendez 5 minutes, Railway redémarre parfois
- **Les données ont disparu** : Restaurez depuis votre backup JSON
- **Mot de passe oublié** : Connectez-vous en tant que `concepteur` / `DEV9999`

Support : Contactez l'Administrateur système (concepteur).
