# ContaAPP — Contabilitate Primară (Google Apps Script)

Aplicație web pentru evidența încasărilor și plăților (numerar și cont bancar), cu rapoarte.
Rulează ca **Google Apps Script web app** și citește/scrie într-un **Google Sheet**.
Codul se editează local (clasp) și se publică în Apps Script.

> Repo GitHub (**public**): <https://github.com/mateimargineanuepc/treiierarhiloginpage>.
> Același repo conține codul aplicației și pagina de login (folderul `docs/`), servită cu GitHub Pages.

---

## 1. Cum e alcătuit sistemul

```
 Utilizator
    │  1. deschide pagina de login (GitHub Pages)         ← folderul docs/ din acest repo
    │  2. se autentifică cu Google (Sign-In)
    │  3. e redirecționat la web app-ul Apps Script, cu un token Google în URL
    ▼
 Web app Apps Script (rulează ca proprietarul deploy-ului)
    │  4. verifică tokenul la Google (tokeninfo) și emailul
    │  5. caută emailul în foaia Nomenclator_Setări (cine are voie)
    │  6. creează o sesiune de 6 ore și o dă paginii
    ▼
 Google Sheet (identificat prin SPREADSHEET_ID)
       Registru_Central  — tranzacțiile
       Nomenclator_Setări — categorii, utilizatori autorizați, acces la rapoarte
```

Cele trei componente:

| Componentă | Unde se află | Rol |
|---|---|---|
| Aplicația | Apps Script (sincronizat local cu `clasp`) | Interfața, logica, accesul la Sheet |
| Datele | Un Google Sheet, referit prin ID | Registrul și nomenclatorul |
| Login | Pagină statică (`docs/`) pe GitHub Pages | Butonul „Sign in with Google" |

---

## 2. Structura proiectului

```
Code.js                 Punct de intrare: doGet, include, funcțiile api* apelate din client,
                        plus funcții de setup și test rulate din editor
Index.html              Pagina principală (șablon) – include css/js/views
appsscript.json         Manifest: fus orar, scope-uri OAuth, setările web app-ului
css/material.html       Stiluri
js/app.html             Logica clientului: login, formular, solduri, runServer()
js/reports.html         Logica clientului pentru rapoarte
views/EntryView.html        Formularul de introducere date
views/ReportsView.html      Rapoartele
views/UnauthorizedView.html Ecranul „Acces neautorizat"
views/LoginView.html        Ecran de rezervă: link către pagina de login (fără sesiune / sesiune expirată)
services/Constants.js       Constante: ID sheet, nume foi, headere, Client ID Google, durata sesiunii
services/SheetService.js    Acces centralizat la Spreadsheet (openById)
services/AuthService.js     Verificare token Google, sesiuni, utilizatori din Nomenclator
services/TransactionService.js, BalanceService.js, CategoryService.js, ReportService.js
.clasp.json             Leagă folderul de scriptul Apps Script (conține script ID-ul)
```

---

## 3. Legătura cu Google Sheet

Scriptul a fost inițial legat de un sheet prin `SpreadsheetApp.getActiveSpreadsheet()`.
Acum se conectează la un sheet ales explicit:

- `services/Constants.js` → `SPREADSHEET_ID` (ID-ul din URL, între `/d/` și `/edit`)
- `services/SheetService.js` → `getSpreadsheet()` face `SpreadsheetApp.openById(SPREADSHEET_ID)`
- Orice cod care are nevoie de spreadsheet trece prin `SheetService.getSpreadsheet()`;
  nu mai există `getActiveSpreadsheet()` nicăieri.

Foile așteptate:

- **`Registru_Central`** — coloane: ID, Dată Înregistrare, Dată Tranzacție, Tip, Sursă Bani, Categorie, Sumă, Explicație, Operat de.
- **`Nomenclator_Setări`** — coloane: Categorii INTRĂRI, Categorii IEȘIRI, Utilizatori, Email, Acces Rapoarte.
  Coloanele *Utilizatori* și *Email* definesc **cine are voie** în aplicație; *Acces Rapoarte* (da/nu) decide cine vede rapoartele.

Dacă foile lipsesc, se rulează o dată `setupSheets()` din editorul Apps Script (creează foile și datele seed).
Contul care face deploy-ul trebuie să aibă drept de **editare** pe sheet.

---

## 4. Autentificare — de ce e construită așa

### Setarea aleasă
`appsscript.json`: `"executeAs": "USER_DEPLOYING"`, `"access": "ANYONE_ANONYMOUS"`
(în dialogul de deploy: *Execute as: Me*, *Who has access: Anyone*).
Aplicația rulează cu contul proprietarului deploy-ului, deci **utilizatorii nu au nevoie de acces la Sheet**.
Accesul „Anyone" înseamnă că Apps Script nu mai cere el un login Google; identitatea o dovedește
tokenul Google verificat pe server (vezi mai jos), iar autorizarea vine din `Nomenclator_Setări`.

### Problema
Cu `USER_DEPLOYING`, `Session.getActiveUser().getEmail()` întoarce **șir gol** pentru vizitatorii
cu conturi Google din alt domeniu (Gmail obișnuit). Rezultatul era „Acces neautorizat (email indisponibil)".
Lista de *test users* din ecranul de consimțământ OAuth **nu rezolvă** asta: ea controlează cine poate autoriza
o aplicație OAuth, nu ce primește `getActiveUser()`.

### Soluția: Google Sign-In cu ID token, verificat pe server
1. Utilizatorul se autentifică cu Google și primește un **ID token** (JWT semnat de Google).
2. Serverul îl verifică (`AuthService.verifyIdToken`) la `https://oauth2.googleapis.com/tokeninfo`:
   - `aud` trebuie să fie `GOOGLE_CLIENT_ID` (din `Constants.js`),
   - emițătorul trebuie să fie `accounts.google.com`,
   - `email_verified` trebuie să fie `true`.
3. Dacă e valid, serverul creează o **sesiune** (`AuthService.login`): un token aleator păstrat în `CacheService`
   (`SESSION_TTL_SECONDS` = 6 ore) care duce la emailul verificat.
4. Fiecare funcție `api*` din `Code.js` primește tokenul de sesiune ca **prim parametru** și începe cu
   `AuthService.useSession(token)`. Fără sesiune validă se aruncă `SESIUNE_EXPIRATA`, iar clientul revine la login.
5. Autorizarea propriu-zisă rămâne neschimbată: emailul trebuie să existe în `Nomenclator_Setări`
   (`requireAuthorizedOperator`, `requireReportAccess`).

În client, `runServer()` (din `js/app.html` și `js/reports.html`) adaugă automat tokenul de sesiune la fiecare apel.
Tokenul se ține în `sessionStorage` (cu try/catch, fiindcă poate fi blocat într-un iframe).

Manifestul include scope-ul `https://www.googleapis.com/auth/script.external_request` (necesar pentru `UrlFetchApp`).

### De ce login-ul NU poate rula în pagina Apps Script
Pagina Apps Script este servită într-un iframe pe `https://n-<hash>-0lu-script.googleusercontent.com`.
Butonul Google Sign-In cere ca origin-ul paginii să fie în *Authorized JavaScript origins* în Google Cloud Console,
iar Console **refuză** domeniul `googleusercontent.com` („Invalid Origin: uses a forbidden domain").
Același lucru se întâmplă și dacă pagina e pusă într-un Google Sites (embed-ul rulează tot pe `googleusercontent.com`).

### Soluția adoptată: pagina de login pe alt domeniu
Butonul Google rulează pe o pagină statică găzduită pe un domeniu acceptat (GitHub Pages),
iar Apps Script primește doar rezultatul. Utilizatorul ajunge **direct în aplicație**, fără un al doilea ecran de login:

1. `https://mateimargineanuepc.github.io/treiierarhiloginpage/` (din `docs/index.html`) afișează butonul Google Sign-In.
2. După login, pagina redirecționează la linkul `/exec` din `docs/config.json`, cu `?id_token=...`.
3. `doGet(e)` (în `Code.js`) citește `id_token`, îl verifică (`AuthService.loginWithIdToken`),
   îl marchează **de unică folosință** (hash-ul lui intră în cache), creează sesiunea și o trimite paginii
   în `window.ContaAuth.bootstrap`. Aplicația se deschide direct.
4. Sesiunea se păstrează în `sessionStorage`, deci o reîncărcare a paginii (cu tokenul deja consumat în URL) nu cere login din nou.

Ecranul din aplicație (`views/LoginView.html`) apare doar ca **rezervă**, cu un singur link „Autentificare"
către pagina de login, când:
- linkul `/exec` e deschis direct, fără token;
- sesiunea a expirat (6 ore) sau a fost ștearsă din cache;
- tokenul din URL e invalid sau a mai fost folosit.

Linkul de rezervă trebuie apăsat de utilizator (nu e redirect automat): iframe-ul Apps Script permite navigarea
ferestrei principale doar după un click.

### Funcțiile globale sunt protejate
Orice funcție globală din `Code.js` poate fi apelată din browser prin `google.script.run`.
De aceea funcțiile de setup și test (`setupSheets`, `migrateNomenclatorReportsColumn`, `test*`)
încep cu `beginEditorRun_()`: se execută doar dacă utilizatorul care le rulează este chiar contul scriptului
(adică rulate din editorul Apps Script), altfel aruncă eroare. Funcțiile cu `_` la final nu sunt apelabile din client.

### Configurarea paginii de login (`docs/config.json`)
Pagina citește la fiecare încărcare fișierul `docs/config.json`:

```json
{
  "clientId": "<OAuth client ID>",
  "appUrl": "https://script.google.com/macros/s/<ID>/exec"
}
```

- **Schimbarea linkului /exec fără push local:** pe GitHub deschide `docs/config.json`, apasă creionul (Edit),
  modifică `appUrl`, apoi *Commit changes*. GitHub Pages se actualizează în 1–2 minute (uneori până la ~10 min din cache).
- Pagina acceptă doar linkuri de forma `https://script.google.com/.../exec`. Orice alt domeniu e refuzat, ca
  tokenul Google să nu poată fi trimis din greșeală către alt site.
- Un deploy nou al web app-ului păstrează același link `/exec` dacă editezi deploy-ul existent (*New version*);
  linkul se schimbă doar dacă creezi un deploy **nou**.
- **Atenție la Windows:** `Index.html` (aplicația) și `index.html` (login) ar fi același fișier pe Windows,
  de aceea pagina de login stă în `docs/` și GitHub Pages se servește din folderul `/docs`.

## 5. Configurare Google Cloud (OAuth)

- Proiect Google Cloud cu un **OAuth client ID** de tip *Web application* (valoarea este în `Constants.js`, `GOOGLE_CLIENT_ID`).
  Client ID-ul nu este un secret.
- Ecranul de consimțământ: *External*. Pentru Sign-In simplu cu email nu sunt necesari test users.
- **GitHub Pages:** *Settings > Pages > Source: Deploy from a branch > `main` > `/docs`*.
- **Authorized JavaScript origins**: `https://mateimargineanuepc.github.io`
  (doar domeniul, fără calea `/treiierarhiloginpage`).

---

## 6. Lucrul local cu `clasp`

Prerechizite: Node, `npm install -g @google/clasp`, Apps Script API activat pe
<https://script.google.com/home/usersettings>, `clasp login` cu contul care deține scriptul.

| Comandă | Ce face |
|---|---|
| `clasp pull` | Aduce codul online în folderul local |
| `clasp push --force` | Încarcă codul local (suprascrie online). `--force` e necesar când se schimbă `appsscript.json`, altfel clasp sare peste push în sesiuni neinteractive |
| `clasp open` | Deschide proiectul în browser |

După `clasp push`, un web app deja publicat **nu** preia codul nou automat:
în editor, *Deploy > Manage deployments > editare > New version*.
La prima rulare după adăugarea unui scope nou, contul care face deploy-ul trebuie să reautorizeze scriptul.

---

## 7. Git și conturi GitHub

- Identitatea locală (`git config --local`) este contul **epc**:
  `matei.margineanu.epc@gmail.com`. Configurația globală (email de serviciu) nu se modifică.
- Contul GitHub folosit: `mateimargineanuepc`, prin alias-ul SSH `matei-epc`
  (remote-ul `origin`: `git@matei-epc:mateimargineanuepc/treiierarhiloginpage.git`, branch `main`).
- `gh` (GitHub CLI) este autentificat cu **alt cont** — nu se folosește pentru acest proiect.

---

## 8. Stare actuală

Făcut (în cod):
- [x] Cod descărcat din Apps Script cu clasp și versionat
- [x] Conectare la un sheet ales prin `SPREADSHEET_ID` (`openById`)
- [x] Autentificare: verificare ID token Google, token de unică folosință, sesiuni de 6 ore, token de sesiune la toate funcțiile `api*`
- [x] `doGet(e)` acceptă `id_token` și deschide direct aplicația; ecranul de login din aplicație e doar link de rezervă
- [x] Funcțiile de setup/test protejate cu `beginEditorRun_()`
- [x] Pagina de login (`docs/index.html`), configurabilă din `docs/config.json`
- [x] Repo `treiierarhiloginpage` pe contul epc, cu `main` urcat

De făcut / verificat în afara codului:
- [ ] `clasp push --force` (s-a schimbat `appsscript.json`) și **New version** pe deploy-ul existent, cu *Who has access: Anyone*
- [ ] GitHub Pages activat: *Settings > Pages > `main` > `/docs`*
- [ ] `https://mateimargineanuepc.github.io` la *Authorized JavaScript origins* (clientul OAuth de tip Web application)
- [ ] `appUrl` completat în `docs/config.json`
- [ ] Test cu un email din `Nomenclator_Setări` și unul din afara listei

## 9. Note de securitate

- Nu se pune niciun token sau secret în repo. Client ID-ul, ID-ul sheet-ului și script ID-ul nu sunt secrete,
  dar nu se publică fără motiv (repo-ul de login e public; aplicația nu).
- Accesul real este controlat de lista din `Nomenclator_Setări`; verifică periodic cine apare acolo.
- Linkul de login transportă un ID token în URL; de aceea tokenul e de unică folosință și expiră repede (aprox. 1 oră).
- Datele nu sunt expuse fără sesiune: toate funcțiile `api*` cer token valid. Oricine află linkul `/exec` poate vedea doar pagina, nu datele.
- Sesiunile stau în `CacheService` și pot dispărea mai devreme de 6 ore; utilizatorul doar se loghează din nou.
