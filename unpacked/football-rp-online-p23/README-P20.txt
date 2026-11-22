FOOTBALL RP ONLINE — P20
Version majeure consolidée : finition visuelle, animation légère et performances adaptatives

BASE ET PRÉSERVATION
- P20 reprend l'archive P19 et conserve les systèmes de match, clubs, IA,
  carrière, mercato, progression, statistiques, sauvegardes locales et profils.
- Le contrôle humain reste strictement individuel : un joueur humain pilote
  uniquement son propre footballeur.
- Format initial 5 contre 5 préservé ; durée réelle toujours comprise entre
  3 et 5 minutes, avec plafond absolu de 5 minutes.
- Les commandes et le cadrage par rôle restent en place.

TRAVAUX P20 INTÉGRÉS
- Ajout d'un mode graphique « Automatique » qui choisit un profil prudent selon
  le nombre de cœurs, la mémoire estimée et le ratio de pixels de l'appareil.
- Sur matériel modeste : ratio de rendu réduit, ombres désactivées et cible
  indicative de 30 FPS ; sur matériel standard : profil équilibré et cible
  indicative de 60 FPS.
- Les choix manuels Bas, Moyen et Haut restent disponibles et sont bornés pour
  éviter de surcharger un appareil d'entrée de gamme.
- Optimisation des filets : plus de recalcul des normales en continu lorsque
  l'animation de but est inactive ; restauration exacte de la géométrie à la
  fin de l'impulsion.
- Animation discrète des quatre fanions de corner.
- Le mode Automatique est proposé dans les paramètres généraux et la pause.

VALIDATION
- Tests automatisés : 94 réussis, 0 échec.
- Vérification syntaxique Node.js de tous les modules src/*.js et tests/*.mjs.
- Intégrité ZIP contrôlée après création de l'archive finale.

LIMITES
- Le nombre de FPS est une cible de profil, pas une mesure réelle garantie.
- Pas de test de rendu interactif sur navigateur ni de test sur Android physique
  effectué pendant cette livraison.
- La synchronisation multijoueur en ligne et les services serveur ne sont pas
  ajoutés par cette version.
