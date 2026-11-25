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
