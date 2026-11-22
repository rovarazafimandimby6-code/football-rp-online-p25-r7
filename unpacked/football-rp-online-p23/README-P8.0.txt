FOOTBALL RP ONLINE — P8.0

VERSION MAJEURE — PREMIÈRE LIVRAISON CONSOLIDÉE DE P8

LOT 1 — FIABILISATION DU MATCH
- Chronomètre protégé contre les deltas invalides ; le moteur de rendu limite séparément les pas de simulation.
- Durée réglementaire verrouillée à deux périodes de 150 secondes, soit 300 secondes maximum.
- Validation des transitions de période et protection contre les buts enregistrés hors phase de jeu.
- Résultat final structuré (vainqueur, score, durée et possession).

LOT 2 — SUIVI DES ÉVÉNEMENTS ET STATISTIQUES
- Journal chronologique des actions (buts, passes, tirs, tacles, interceptions et reprises).
- Historique borné à 80 événements pour éviter une croissance mémoire sans limite.
- Compteurs de corners, touches et six mètres ajoutés aux statistiques d'équipe.

LOT 3 — IA ET TACTIQUE COLLECTIVE
- Le réglage de mentalité s'applique maintenant symétriquement aux deux équipes.
- Le pressing haut, normal ou bas n'avantage plus artificiellement une seule équipe.
- Le décalage tactique tient compte de la direction réelle d'attaque, y compris après le changement de côté.

LOT 4 — REPRISES DE JEU
- Consolidation des événements de touche, corner et six mètres déjà gérés par le moteur.
- Attribution et comptabilisation des reprises par équipe dans les statistiques et le journal.

LOT 5 — VALIDATION AUTOMATISÉE
- Tests unitaires du chronomètre, de la mi-temps, du temps réglementaire, des buts, du résultat final et du journal d'événements.

RÈGLES CONSERVÉES
- Match local 5 contre 5 (10 joueurs sur le terrain).
- Deux périodes de 2 min 30 ; plafond absolu de 5 minutes.
- Aucun prolongement au-delà de 300 secondes.
- Commandes tactiles et clavier, caméra 2.5D, météo, formations et qualité graphique conservées.

ÉTAT ET LIMITES
- P8.0 est une évolution du prototype local contre IA.
- Le multijoueur en ligne réel, les comptes persistants, les clubs, les compétitions, le mercato et les carrières connectées ne sont pas encore implémentés : ils nécessitent une architecture serveur, une authentification et une synchronisation réseau dédiées.
- Le hors-jeu, l'arbitrage avancé et la détection complète des fautes restent à développer.
- Le rendu doit être testé sur des appareils Android réels ; le test automatisé ne remplace pas un essai sur téléphone.

LANCEMENT
- Servir le dossier via HTTP/HTTPS ; ne pas ouvrir index.html avec file://.
- Three.js 0.170.0 est chargé depuis jsDelivr : une connexion Internet est requise.
- Utiliser le mode paysage sur téléphone.

CONTRÔLES
- Clavier : WASD/flèches, E passe, Maj+E passe lobée, Espace tir, Q tacle, Tab/C changement de joueur, Maj sprint.
- Tactile : joystick, sprint, tacle, passe (appui long = lob), tir (appui long = puissance), changement de joueur.
