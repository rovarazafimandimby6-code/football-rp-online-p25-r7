FOOTBALL RP ONLINE — P12.0
==========================

BASE
- Reprise de l’archive P11 consolidée (P10.1 à P10.5).
- Les modules de match, physique, IA, endurance, profils et clubs existants sont conservés.

NOUVEAUTÉS P12.0
- Ajout d’un écran d’accueil et d’un menu principal avant toute initialisation du match.
- Navigation Accueil, Mon joueur, Clubs, Compétitions, Mercato, Classements, Communauté et Paramètres.
- La fiche joueur lit le profil local existant et affiche ses attributs.
- La page Clubs lit les clubs préinstallés depuis ClubManager.
- Les modules Compétitions, Mercato, Classements et Communauté sont explicitement indiqués comme en développement lorsqu’ils ne sont pas encore reliés à une expérience complète.
- Le bouton Jouer mène à un choix de Match rapide, puis lance le prototype local 5 contre 5 face à l’IA.
- Ajout de préférences locales pour la durée (3 ou 5 minutes) et la qualité graphique.
- Refonte du menu Pause : Reprendre, Statistiques, Mon joueur, Événements, Paramètres et Quitter avec confirmation.
- Les statistiques et événements consultés proviennent de l’état courant du match.
- Ajout de blasons provisoires générés à partir des initiales des clubs sur les listes et le tableau de score.
- Retrait des commandes tactiques collectives de l’interface de match : le joueur ne commande que son propre footballeur.

LIMITES CONNUES
- Les écussons sont des placeholders graphiques, pas les logos définitifs des clubs.
- Le menu d’accueil utilise une composition visuelle CSS ; il ne contient pas encore de stade 3D animé dédié.
- Le match lancé reste une démonstration locale contre l’IA. Il n’existe pas encore de serveur multijoueur autoritaire ni de matchmaking en ligne.
- Les modules Compétitions, Mercato, Classements et Communauté ne sont pas encore des parcours complets.
- Pas de validation visuelle sur appareil Android dans cet environnement.

VALIDATION EFFECTUÉE
- Vérification syntaxique Node.js sur tous les fichiers src/*.js.
- Suite automatisée Node : 56 tests réussis, 0 échec (52 tests hérités + 4 contrôles statiques P12) (tests hérités de P11).
- Intégrité de l’archive ZIP vérifiée après création.
- Cette validation ne remplace pas un test de navigation dans un navigateur mobile ni un essai sur téléphone Android.
