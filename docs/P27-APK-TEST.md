# P27 — APK Android de test (mode local)

## Objectif

Produire une APK Android de débogage installable pour valider le parcours local sur un téléphone Android modeste. Cette première APK n'est ni une version de production ni une publication Play Store.

## Périmètre activé

- création immédiate d'un profil joueur local, sans compte ;
- conservation locale du profil et de la progression via le stockage du WebView ;
- interface en orientation paysage ;
- match local 5 contre 5 contre l'IA ;
- commandes tactiles et réglages graphiques existants ;
- Three.js et les modèles 3D embarqués dans l'APK, sans CDN requis au démarrage.

## Fonctions volontairement désactivées

- association Google et récupération cloud ;
- synchronisation serveur ;
- salons et matchs multijoueurs en ligne ;
- fonctionnalités qui exigent un serveur P27 public.

Ces fonctions restent dans le dépôt et ne sont pas supprimées ; elles seront réactivées dans une version connectée après validation de l'APK locale.

## Compilation

Le workflow GitHub Actions P27 Android test APK se déclenche sur les pushes de p27-dev ou manuellement. Il exécute npm test, construit les fichiers web avec Vite, copie assets/players, génère le projet Android avec Capacitor et compile app-debug.apk.

L'APK est publiée comme artefact GitHub Actions pendant 14 jours. Elle n'est pas signée pour distribution publique.

## Vérifications sur téléphone

1. Installer l'APK et autoriser l'installation depuis la source utilisée.
2. Lancer l'application en mode paysage, sans connexion Internet.
3. Créer un profil local, fermer puis relancer l'application et vérifier que le profil est conservé.
4. Lancer un match 5 contre 5, tester déplacement, sprint, passe, tir, lob et tacle.
5. Terminer le match et vérifier le résultat et la progression locale.
6. Quitter et relancer l'application pour contrôler la persistance.
7. Refaire un match en qualité graphique basse puis moyenne et noter fluidité, chauffe et autonomie.

La réussite du workflow prouve uniquement que l'APK a été compilée. La validation fonctionnelle exige une installation et un essai réel sur le téléphone cible.


## Affichage plein écran paysage — exigence P27

- L'APK Android verrouille l'activité en paysage au niveau du manifeste natif.
- L'activité Capacitor masque les barres d'état et de navigation avec le mode immersif persistant ; un balayage système peut toutefois les faire réapparaître temporairement, conformément aux règles Android.
- Le contenu utilise toute la surface disponible, y compris les zones de découpe compatibles, sans conteneur 16:9 qui ajouterait des bandes.
- Le manifeste web demande également `orientation: landscape` et `display: fullscreen` pour les lancements web installés qui prennent en charge ces propriétés.
- Le rendu 3D recalcule sa caméra et sa taille à partir du viewport réel après redimensionnement ou rotation.

**Référence de conception : 1920 × 1080 (16:9).** Cette valeur est une base de conception, pas une résolution matérielle imposée : Android ne permet pas à une application de changer la résolution physique de l'écran. Sur un téléphone dont la dalle a un autre ratio ou une autre définition, l'interface et le rendu s'adaptent à toute la surface native afin d'éviter les bandes. Il ne faut pas étirer artificiellement l'image ni ajouter de letterboxing pour simuler du 16:9.

### Contrôle obligatoire sur appareil

1. Installer l'APK sur le téléphone cible et lancer l'application : elle doit démarrer directement en paysage.
2. Vérifier que les barres système sont masquées au démarrage, sur l'accueil, les bibliothèques, les paramètres et le match.
3. Vérifier que l'image remplit l'écran jusqu'aux bords, sans bande noire ou grise permanente.
4. Faire apparaître temporairement les barres système par un balayage, puis vérifier que le mode immersif les masque à nouveau.
5. Tester après verrouillage/déverrouillage, retour depuis une autre application et redimensionnement du viewport.
6. Confirmer que le canvas 3D reste proportionné et que le HUD ne se décale pas.

La compilation et les tests automatisés vérifient la configuration du projet ; seule cette vérification sur téléphone confirme le comportement réel de la dalle et des barres système.
