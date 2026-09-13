# Backlog — Sport Timer

Les constats ci-dessous ont été vérifiés dans le code, pas recopiés d'une idée.
Chaque entrée cite le point d'entrée à corriger.

## P1 — Mode Multi (duo) : robustesse

- [ ] **L'écran s'éteint pendant un entraînement à deux.**
  `requestWakeLock()` n'est appelé qu'au départ du run solo (`app.js`, `startWorkoutRun`)
  et du chrono (`toggleChrono`) ; `startMultiWorkoutRun` ne le demande jamais, et aucun
  `releaseWakeLock()` n'est fait à la fin d'une séance duo.

- [ ] **Le duo perd des phases après une mise en veille du téléphone.**
  `handleAppResume` sort immédiatement si `currentWorkout` est vide, donc rien ne rattrape
  le retard en duo : au réveil, `multiTick` ne fait avancer qu'une seule phase au lieu de
  toutes celles écoulées. Le solo dispose de `fastForwardFromOverrun` pour ça ; il manque
  l'équivalent côté multi.

- [ ] **Pas de célébration en duo.**
  `showCelebration` n'est déclenchée que depuis le run solo (fin de cycle dans
  `updateRunDisplay`, et dernier cycle dans `showWorkoutDone`). Un objectif atteint à deux
  passe inaperçu.

## P2 — Historique d'entraînement

- [x] **Base locale des séances + écran Historique.**
  Clé `workout-history` dans le `localStorage`, une entrée par séance (solo et duo),
  écrite automatiquement à la fin d'un entraînement comme à son interruption.
  Écran `screen-workout-history` : totaux sur 7 jours / 30 jours / tout, liste des séances,
  suppression unitaire et suppression multiple via le mode « Gérer ».

- [ ] **Le détail par cycle n'est pas conservé en duo.**
  `recordMultiSession` enregistre les totaux par joueur (reps, objectif, kg) mais pas le
  découpage cycle par cycle, contrairement au solo. À faire quand `multiSessionData`
  portera l'information du cycle.

- [ ] **Aucun accès à l'historique depuis l'écran de fin de séance.**
  Les boutons « Done » (`finishWorkoutRun`, `multiFinish`) renvoient vers la liste des
  workouts ; proposer d'ouvrir l'historique juste après la séance qu'on vient d'y écrire.

- [ ] **Pas de purge ni d'export.**
  L'historique grossit sans limite dans le `localStorage` et ne peut ni être exporté
  (JSON/CSV) ni réimporté. Un quota dépassé est silencieux : `histSave` renvoie `false`
  sans que l'interface le signale.

## P3 — Divers

- [ ] **Interface mi-anglaise mi-française.**
  Les écrans Sport (« My Workouts », « Start Solo Workout », « Done ») sont en anglais,
  le reste (jeûne, multi, historique) en français.

- [ ] **Aucun test automatisé.**
  Les vérifications se font à la main dans le navigateur ; un script Playwright de fumée
  couvrirait au moins le cycle de vie d'une séance et l'écriture en historique.
