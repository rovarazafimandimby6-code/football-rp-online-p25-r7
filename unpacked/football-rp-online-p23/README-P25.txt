FOOTBALL RP ONLINE — P25
Refonte consolidée de la présentation du match — build de travail renforcé

RÉFÉRENCE
La capture P24 du 22 novembre 2026 a été examinée. Les corrections ciblent directement la caméra trop éloignée, les joueurs trop petits, les noms superposés et les éléments HUD qui masquaient le bas du terrain.

CHANGEMENTS P25
- Caméra Diffusion TV abaissée et rapprochée (hauteur 20, distance 34, FOV 49) ; cadrage fluide avec anticipation de balle.
- Zoom 0–100 corrigé, y compris la valeur 0 ; 55 % reste la valeur initiale. Caméra et zoom sont sauvegardés depuis les préférences et le menu pause.
- Joueurs 3D agrandis de 8 % à l'affichage, sans modifier leurs collisions.
- Noms Standard : joueur contrôlé en priorité, deux joueurs proches au maximum, filtrage hors champ et prévention des chevauchements.
- Mini-carte déplacée en haut à gauche ; identification/endurance libérée en bas-centre ; FPS masqué hors débogage.
- Styles d'étiquettes historiques contradictoires supprimés au profit d'une seule définition P25.
- Pylônes d'éclairage plus fins et reculés pour moins obstruer la vue.

CONSERVATION RP
- Chaque humain contrôle uniquement son propre joueur.
- Les autres joueurs restent contrôlés par les autres humains ou par l'IA.
- Aucune commande collective ni sélection automatique de coéquipier ajoutée.
- Carrière, clubs, profils, effectifs et systèmes serveur conservés dans la base récupérée.

VALIDATION
- 179 tests automatisés réussis, 0 échec (suite Node.js).
- Syntaxe JavaScript vérifiée sur src/, server/ et tests/.
- Archive ZIP vérifiée.

LIMITES TECHNIQUES
- Le modèle masculin GLTF et les animations génériques de locomotion sont raccordés ; les animations footballistiques spécifiques et la validation visuelle restent à faire.
- L'architecture du stade demeure stylisée, pas photoréaliste.
- Aucune validation sur appareil Android physique ni test visuel interactif WebGL n'a été réalisée ici.
- Le prototype multijoueur n'est pas encore relié de bout en bout entre simulation serveur et avatars 3D client ; le transport reste en HTTP polling. Voir README-P24 et README-P23 pour les limites détaillées.

INTÉGRATION HUMANOÏDE P25 (RESSOURCES STANDARD CC0)
- Ajout du modèle masculin Superhero_Male_FullBody au format glTF, de ses textures et de son rig de 65 articulations.
- Ajout des variantes de coiffure masculines Buzzed, SimpleParted et Long, ainsi que barbe et sourcils, avec dépendances de textures.
- Les noms et l'ordre des 65 articulations des coiffures sélectionnées correspondent au rig du personnage masculin.
- Chargement asynchrone GLTF : l'avatar procédural reste affiché pendant le chargement et sert de repli si le chargement échoue.
- Ajout du GLB Universal Animation Library Standard sans root motion. Les clips Idle_Loop, Walk_Loop, Jog_Fwd_Loop et Sprint_Loop sont raccordés aux états locomoteurs.
- Les gestes de match (passe, tir, contrôle, tacle, plongeon, célébration) sont posés procéduralement sur le squelette humanoïde par articulation ; le pack d’animations ne contient pas de véritables clips footballistiques dédiés.
- Les ressources et leurs dépendances sont rangées dans assets/players/ ; les conditions CC0 sont consignées dans assets/players/LICENSES.txt.

LIMITES DE VALIDATION DE L'INTÉGRATION
- Vérification automatisée des dépendances glTF, des rigs de 65 os et du raccordement des animations : incluse dans les tests P25.
- Le rendu réel, l'orientation du modèle, l'ajustement de taille, les matériaux de maillot et les transitions sur navigateur mobile doivent encore être validés visuellement sur appareil Android.
- Les coiffures sont préparées et leurs rigs vérifiés ; leur alignement visuel final sur le crâne doit être contrôlé en rendu.
- Les animations de passes, tirs, dribbles, tacles, duels aériens et arrêts du gardien restent à produire ou acquérir séparément.


CONSOLIDATION R7 — PRÉSERVATION DES RESSOURCES
- La bibliothèque Universal Animation Library Standard est conservée intégralement : 43 clips, sans root motion et avec son skin/rig.
- Les textures sources restent en 2048 × 2048 dans cette build de référence ; aucune réduction destructive en 1024 × 1024 n'est appliquée.
- Le contrôle automatisé R7 vérifie le nombre de clips, les animations de locomotion et plusieurs clips secondaires, la présence du skin et la correspondance des 65 articulations du modèle masculin.
- La build R7 privilégie la fidélité des ressources ; l'optimisation future devra être mesurée et ne pourra supprimer des clips ou dégrader les textures sans profil de qualité explicite.
- La validation WebGL visuelle et le test sur appareil Android restent à effectuer.


MISE À JOUR R7 — GESTES SUR SQUELETTE HUMANOÏDE
- Le modèle GLTF reste visible pendant les gestes de match ; le mannequin procédural est masqué après chargement réussi.
- Ajout de poses articulées pour passe/tir, contrôle, tacle/plongeon et célébration, avec prise en compte du pied préféré et de la direction du plongeon.
- Fondu des animations de locomotion avant application des poses de geste.
- Ces poses sont procédurales et ne doivent pas être confondues avec de la motion capture ou des clips footballistiques enregistrés.
- Suite de tests automatisés : 179 réussis, 0 échec. Validation visuelle WebGL et Android toujours requise.

CORRECTION R7 — MAPPING DU SPRINT
- Le mapping de course rapide utilise le nom exact `Sprint_Loop` présent dans le GLB fourni.
- Un contrôle automatisé empêche de référencer un nom de clip inexistant (`Sprint_Fwd_Loop`).
- La vérification des clips confirme que la sélection de sprint correspond à une animation réellement incluse dans le pack.
