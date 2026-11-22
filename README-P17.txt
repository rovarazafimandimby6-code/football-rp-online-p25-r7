FOOTBALL RP ONLINE — P17
========================

Base : P16, conservée et enrichie.

Nouveautés P17
--------------
- Calendrier, effectifs, reprise des clubs, résultats et classement sauvegardés localement.
- Restauration contrôlée des données de saison au redémarrage ; données corrompues ignorées sans bloquer le menu.
- Les passes du personnage contrôlé distinguent désormais passes tentées et passes réussies : une réussite n'est ajoutée que lorsque le coéquipier ciblé contrôle effectivement le ballon.
- La note individuelle utilise le nombre de passes confirmées, et non une précision artificielle.
- Interface compétition et profil indiquent explicitement la conservation locale.

Règles conservées
-----------------
- Le joueur humain contrôle uniquement son propre footballeur.
- Les matchs restent limités à 3 ou 5 minutes réelles maximum.
- La première base reste un prototype local, pas encore un service multijoueur en ligne.

Limites
-------
- Les données de saison et statistiques sont locales à l'appareil et au navigateur ; elles ne sont pas synchronisées entre appareils.
- Les résultats officiels ne sont pas encore générés automatiquement à partir des matchs joués : le calendrier local et l'enregistrement des résultats restent des fonctions de démonstration.
- Les passes décisives ne sont pas encore attribuées.
- Aucun test physique Android n'a été réalisé dans cette validation.

Validation technique
--------------------
- Tests automatisés Node : 80 réussis, 0 échec.
- Contrôle syntaxique de tous les fichiers JavaScript src/*.js : réussi.
