FOOTBALL RP ONLINE — P14
=======================

BASE
- P13 conservée comme base : parcours avant-match, profil local, clubs préinstallés, calendrier local, menu principal et pause.
- Les commandes tactiles restent exclusivement liées au footballeur contrôlé par le joueur.
- Les formats de match restent limités à 3 ou 5 minutes maximum.

P14 — CARRIÈRE ET MERCATO LOCAL
1. Contrats
- Signature d'un premier contrat avec un club préinstallé.
- Durée prototype : 180 jours.
- Salaire hebdomadaire affiché dans l'espace Mercato.
- Sauvegarde locale du club, du contrat, du budget, des offres et de l'historique.

2. Mercato
- Sollicitation d'offres de démonstration auprès des autres clubs préinstallés.
- Négociation du salaire hebdomadaire et de l'indemnité.
- Acceptation possible uniquement pendant une fenêtre de transfert.
- Refus des offres, contrôle du budget, expiration et historique des transferts.
- Fenêtres locales récurrentes : janvier et juillet.
- Les offres générées restent valides jusqu'à la fin de la fenêtre active ou prochaine.

3. Entraînement
- Séances individuelles pour améliorer vitesse, finition, passe, défense, endurance ou contrôle.
- Coût : 80 crédits par point, jusqu'à 3 points par séance.
- Une séance rapporte aussi 25 points d'expérience par point dépensé.
- Passage de niveau : attribution des points d'entraînement et de crédits selon le système de profil existant.
- Sauvegarde locale des progrès.

4. Interface
- Écran Mercato relié aux fonctions de contrat et de transfert.
- Affichage du budget, du statut de fenêtre, des offres et de l'historique.
- Entraînement intégré à l'espace Mon footballeur.
- Mise en page responsive pour écrans mobiles.

LIMITES
- Mercato de démonstration local : les offres sont calculées à partir des niveaux des clubs préinstallés.
- Aucun serveur, aucune négociation avec de vrais joueurs et aucune synchronisation multi-appareils.
- Les salaires ne sont pas encore versés automatiquement au fil du temps.
- Les résultats des matchs ne créditent pas encore automatiquement la carrière du joueur.
- Les attributs entraînés ne modifient pas encore toutes les animations ou les modèles 3D du joueur.
- Pas de validation visuelle sur téléphone Android physique dans cet environnement.

VALIDATION TECHNIQUE
- node --check sur tous les modules src/*.js.
- npm test : 69 tests réussis, 0 échec.
- Tests P14 dédiés : persistance contrat/offres, négociation, transfert pendant fenêtre, refus hors fenêtre, budget insuffisant, entraînement et intégration UI.
- Archive ZIP testée avec unzip -t.
