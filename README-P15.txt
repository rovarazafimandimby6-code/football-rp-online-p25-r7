FOOTBALL RP ONLINE — P15
=======================

BASE
- P14 récupérée depuis la bibliothèque et inspectée : archive ZIP valide, 67 entrées.
- Tous les systèmes P13/P14 sont conservés : menus, profil, clubs, calendrier, pause, match local contre IA, contrats, mercato local et entraînement.
- Contrôle individuel strict : le joueur humain contrôle uniquement son propre footballeur.
- Matchs limités à 3 ou 5 minutes réelles, avec deux périodes et chronomètre virtuel 00:00–90:00.

P15 — CARRIÈRE CONNECTÉE AUX RÉSULTATS
1. Fin de match
- Le moteur émet un résultat structuré au coup de sifflet final : vainqueur, score, durée, possession et statistiques d'équipe.
- Le signal de fin est protégé contre les doubles déclenchements pour une même rencontre.
- Le signal est réarmé uniquement lorsqu'un nouveau match est lancé depuis l'écran de fin.

2. Récompenses de carrière
- Le résultat de l'équipe contrôlée par le joueur est converti en victoire, nul ou défaite.
- La récompense de match est ajoutée au journal de carrière et au portefeuille du CareerManager.
- L'expérience et les crédits sont également crédités au profil joueur persistant.
- Les gains d'expérience déclenchent le passage de niveau et attribuent les points d'entraînement prévus.
- Une victoire sans but encaissé par l'équipe contrôlée bénéficie du bonus de clean sheet.

3. Persistance
- Les récompenses du profil sont sauvegardées via PlayerProfileStore.
- Le journal de carrière conserve le résultat et les récompenses via CareerManager.

LIMITES
- Prototype local contre IA : aucun résultat serveur ou multijoueur en ligne.
- Les buts/assists individuels du personnage ne sont pas attribués automatiquement ; les récompenses sont basées sur le résultat collectif de l'équipe contrôlée.
- Le classement du championnat n'est pas encore automatiquement relié aux matchs rapides.
- Les tests sont automatisés sous Node.js ; pas de test physique Android ni de test WebGL sur téléphone dans cet environnement.

VALIDATION TECHNIQUE
- 71 tests automatisés réussis, 0 échec.
- Vérification syntaxique de tous les modules JavaScript effectuée.
- Archive ZIP contrôlée après empaquetage.
