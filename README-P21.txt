FOOTBALL RP ONLINE — P21
Version majeure consolidée : physique du ballon et gestes techniques

BASE
- P21 reprend l'archive P20 fournie dans la Library.
- Les systèmes de match, clubs, IA, carrière, mercato, progression,
  statistiques, sauvegardes locales, profils, commandes et rendu sont conservés.
- Le contrôle humain reste individuel : un joueur humain pilote uniquement
  son propre footballeur ; aucune passe ne transfère le contrôle.
- Format 5 contre 5 et durée réelle de 3 à 5 minutes maximum conservés.

TRAVAUX P21 INTÉGRÉS
- Ajout d'un effet latéral de tir borné, piloté par la direction visée.
- Intensité influencée par les attributs de tir et de contrôle, la puissance
  demandée et le pied de contact (pied faible moins efficace).
- Application d'une accélération latérale de type Magnus dans la physique
  du ballon libre.
- Atténuation progressive du spin pour éviter une courbure permanente.
- Les tirs humains utilisent l'intention latérale du joystick ; les tirs IA
  reçoivent une variation technique légère et déterministe par numéro.
- Aucun effet de spin n'est appliqué aux ballons remis à zéro.

VALIDATION
- Base P20 avant modification : 94 tests réussis, 0 échec.
- P21 après modification : 98 tests réussis, 0 échec.
- node --check exécuté sur tous les modules src/*.js et tests/*.mjs.
- Intégrité de l'archive contrôlée après génération.

LIMITES
- L'effet de courbe est un modèle physique simplifié, pas une simulation
  complète de l'aérodynamique d'un ballon réel.
- Aucun test de rendu navigateur ni test sur téléphone Android physique
  n'a été effectué pendant cette livraison.
- La synchronisation multijoueur en ligne nécessite toujours un serveur
  autoritaire et n'est pas ajoutée par cette version.
