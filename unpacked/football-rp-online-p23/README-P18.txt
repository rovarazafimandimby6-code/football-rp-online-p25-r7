FOOTBALL RP ONLINE — P18
========================

Base : archive P17 récupérée depuis la Library et conservée comme socle.

Nouveautés P18 intégrées dans cette première construction
---------------------------------------------------------
- Nouveau module role-presentation.js : profils distincts pour GK, DEF, MID et FWD.
- Caméra de match adaptative : hauteur, distance, largeur de cadrage, poids du joueur contrôlé et lissage varient selon le poste.
- Joystick adaptatif : courbe de réponse, sensibilité et zone morte spécifiques au rôle ; intensité bornée.
- Le poste choisi dans le profil joueur sélectionne le personnage correspondant dans le onze bleu ; nom et numéro du profil sont repris en match.
- Boutons tactiles renommés automatiquement selon le poste attribué.
- HUD : affiche le poste du personnage contrôlé.
- Gardien : le bouton d'action défensive déclenche une animation de plongeon/sortie et peut saisir le ballon à courte portée ; relance courte et dégagement restent disponibles avec les commandes de passe et tir.
- La mise à jour du rôle est liée au joueur contrôlé ; aucune commande ne transfère le contrôle à un coéquipier.

Règles préservées
-----------------
- Contrôle individuel : un joueur humain ne contrôle que son propre footballeur.
- Match 5v5 dans le prototype, durée réelle plafonnée à 5 minutes (formats 3 ou 5 minutes existants).
- Carrière, clubs, mercato, progression, statistiques et données locales P17 conservés.
- Pas de prétention de multijoueur serveur : le prototype demeure local.

Validation technique
--------------------
- Tests automatisés Node : 84 réussis, 0 échec.
- Contrôle syntaxique de tous les fichiers JavaScript src/*.js : réussi.
- Intégrité de l'archive ZIP : à vérifier lors de la génération finale.

Limites / travail restant dans P18
----------------------------------
- La caméra adaptative est une première version déterministe ; son comportement visuel doit être vérifié en jeu sur téléphone.
- Le plongeon du gardien est une interaction prototype, pas encore un système complet de gardien avec animations de parade, prise haute, relâchement et collisions spécialisées.
- La refonte complète de l'interface, les modèles 3D humanoïdes plus détaillés, le stade enrichi, les animations avancées et l'optimisation visuelle restent à poursuivre dans cette version majeure.
- Aucun test sur appareil Android physique n'a été réalisé.

Consolidation UI tactile (lot supplémentaire)
---------------------------------------------
- Hiérarchie visuelle des boutons A/B/C et sprint adaptée au rôle.
- États tactiles plus visibles et dimensions compactées sur les petits écrans paysage.
- Libellés d'accessibilité et indicateur de poste dans le HUD.


Mise à jour du modèle joueur
- Le joueur 3D conserve un rig articulé procédural léger, enrichi de détails faciaux, de coiffures différenciées, de détails de tenue et de crampons.
- Le numéro du profil est affiché sur le maillot et mis à jour à l'initialisation du match.
- Les animations de passe et de tir utilisent le pied dominant du joueur.
- Ce modèle est une amélioration procédurale du prototype, pas encore un personnage scanné ou un modèle GLB réaliste.
