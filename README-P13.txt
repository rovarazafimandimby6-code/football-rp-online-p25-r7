FOOTBALL RP ONLINE — P13
=======================

BASE
- P12.1 récupérée depuis la bibliothèque : archive de 98 505 octets, 61 entrées.
- Conservation des systèmes de match, contrôles individuels, IA locale, menu principal, pause, identité des clubs, progression et réglages.

P13 — FONCTIONNALITÉS
1. Parcours avant-match
- Sélection des clubs domicile et extérieur parmi cinq clubs préinstallés.
- Présentation des deux clubs, écussons provisoires, villes, formation annoncée et format 5 contre 5.
- Le lancement du match passe par la sélection puis la présentation ; le moteur n'est pas lancé directement au démarrage.
- Les noms sélectionnés apparaissent au tableau d'affichage.
- Les commandes restent limitées au footballeur du joueur.

2. Profil et personnalisation locale
- Édition du nom affiché, numéro, poste et pied préféré.
- Choix du maillot, du teint, de la coiffure et de la couleur des cheveux.
- Sauvegarde locale via PlayerProfileStore.
- Les paramètres de teint et de coiffure sont enregistrés, mais ne modifient pas encore le modèle 3D.

3. Clubs
- Statuts visibles : géré par l'IA, ouvert à la reprise, géré par le joueur.
- Reprise d'un club ouvert, limitée à un club par joueur local.
- Aucune réservation serveur ou reprise en ligne.

4. Compétitions
- Classement avec MJ, V, N, D, BP, BC et points.
- Génération d'un calendrier aller simple de 10 rencontres pour les cinq clubs.
- Aucun score fictif n'est attribué.
- Calendrier et reprise restent des données locales en mémoire de session.

LIMITES
- Prototype solo/local contre IA ; pas de serveur multijoueur connecté.
- Pas de persistance serveur ni de synchronisation entre appareils.
- Les effectifs et maillots des clubs ne sont pas encore liés au moteur 3D.
- Présentation avant-match actuellement en interface 2D, sans tunnel ni entrée cinématique 3D.
- Mercato jouable, contrats et négociations non intégrés à l'interface.
- Pas de validation visuelle sur téléphone Android physique.

VALIDATION TECHNIQUE
- node --check sur tous les modules src/*.js.
- npm test : 64 tests réussis, 0 échec.
- Archive ZIP finale vérifiée avec unzip -t, aucune erreur.
