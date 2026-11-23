FOOTBALL RP ONLINE — P12.1
==========================

BASE
- P12.0 issue de l’archive P12.0 vérifiée (94 907 octets, 58 entrées ZIP).
- Conservation du menu principal, du parcours de lancement du match, du menu Pause et des modules de jeu précédents.

NOUVEAUTÉS P12.1
- Nouveau module partagé src/club-identity.js pour l’identité graphique des clubs.
- Écussons SVG vectoriels avec forme de blason, bordure, initiales, contraste et libellé accessible.
- Palette dédiée aux cinq clubs préinstallés : Antananarivo FC, Toamasina United, Mahajanga City, Fianarantsoa Athletic et Antsirabe Sport.
- Réutilisation du même composant dans la liste des clubs et l’en-tête du menu Pause.
- Affichage des noms des deux équipes depuis le tableau de score dans le menu Pause.
- Ajustements de taille des blasons pour les écrans mobiles.

LIMITES
- Ces écussons sont des identités provisoires conçues pour le prototype, pas des logos officiels fournis par les clubs.
- Le jeu reste un prototype local contre l’IA ; le serveur multijoueur n’est pas connecté.
- Aucun test visuel réel sur navigateur Android ou téléphone n’a été effectué dans cet environnement.

VALIDATION EFFECTUÉE
- node --check sur tous les fichiers src/*.js.
- npm test : 59 tests réussis, 0 échec (56 tests hérités de P12.0 + 3 nouveaux tests P12.1).
- Archive ZIP testée après empaquetage.
