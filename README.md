# AR - Visitors — Odoo 19

## Installation et paramétrage

Copier ce dossier dans les addons et installer ou mettre à jour `ar_visitors`.
Dépendances Odoo : base, mail, hr, survey et web. Aucune bibliothèque faciale à installer.

- Attribuer les rôles Accueil / Responsable / Administrateur selon les utilisateurs.
- Configuration > Quiz par langue : associer un sondage français,
  anglais et espagnol, chacun rédigé dans sa langue. Le choix de langue ouvre directement le quiz.
  Configurer de vraies questions et désactiver l’obligation de connexion au sondage
  pour que les visiteurs puissent répondre sans compte Odoo.
- Paramètres : durée de validité du quiz (3 mois), durée de session de la borne,
  mise à jour des fiches existantes. Les scores servent uniquement aux analyses.
- Renseigner les e-mails professionnels des employés et le serveur sortant Odoo.

## Tester maintenant, sans API

1. Visites > Toutes les visites > Nouveau.
2. Pour une nouvelle personne, saisir sa photo (facultative en test manuel), puis
   cliquer sur « Ouvrir le parcours visiteur » et compléter nom, prénom et CIN.
   Pour une personne connue, sélectionner sa fiche ou renseigner sa CIN.
3. Choisir FR / EN / ES dans la fenêtre. Le quiz s’ouvre dans une fenêtre intégrée.
4. Terminer le quiz, même avec un score nul : l’entrée s’enregistre et le parcours
   passe automatiquement au choix de la personne à visiter.
5. Confirmer l’hôte : sa notification est envoyée. Les erreurs d’envoi sont visibles
   sur la visite, avec un bouton de renvoi.
6. Dans la fiche de visite, cliquer sur « Marquer la sortie et signer ».
   La validation de la signature enregistre automatiquement la sortie.

Une personne connue ayant terminé son quiz il y a 3 mois ou moins passe directement
au choix de l’hôte. Une visite ne prolonge jamais la validité du quiz. Sans quiz ou
après expiration, le parcours linguistique est requis.

Une session borne expirée doit être rouverte depuis la fiche si la visite est encore
en cours de saisie ; une visite annulée nécessite une nouvelle visite.

## Stockage

Les personnes (nom, prénom, CIN, référence externe), quiz et visites sont enregistrés
dans la base Odoo. Les photos et signatures utilisent les pièces jointes Odoo et son
stockage configuré. Sauvegarder ensemble PostgreSQL et le filestore. Le dossier du
module ne contient pas les données des visiteurs. Les anciennes données ne sont
pas purgées par le nettoyage des fichiers sources.

## Vérification

Les tests métier sont dans `tests/` : parcours nouveaux/connus, expiration,
score nul, entrée, notification simulée, signature et adaptateur non connecté.
Exécuter sur une base isolée avec `--test-enable --test-tags /ar_visitors`.

Le nettoyage retire les scripts de démonstration, l’ancien générateur de guide,
le moteur facial local, son Dockerfile et ses dépendances. Les bibliothèques déjà
installées dans le serveur ne sont pas désinstallées par cette opération.

## Accès indépendants et résultats

Les quatre droits sont : Accès au module, Accès Configuration, Accès Résultats
 des quiz et Accès Personnes. Les trois droits spécialisés incluent uniquement
l’accès au module, sans s’inclure mutuellement. Leurs menus sont masqués sans le
droit correspondant et les modèles sont protégés côté serveur. L’accueil peut
continuer les visites par saisie de CIN sans consulter le répertoire Personnes.
Les paramètres visiteurs n’exigent pas l’administration générale d’Odoo.

Résultats des quiz : ouvrir une passation pour voir chaque question, la réponse
saisie ou choisie et les points. Les résultats sont en lecture seule et limités
aux sociétés autorisées. Les droits natifs de l’application Sondages, si attribués
séparément à un utilisateur, restent gérés par Odoo.


## Reconnaissance avec Face Recognition for HR Attendance

Dépendance : `sttl_face_attendance` (Face Recognition for HR Attendance).
Dans **Visites → Reconnaissance faciale**, un utilisateur ayant l'accès **Module**
peut activer la caméra. Le moteur face-api.js et les modèles
sont ceux du module installé ; les références proviennent des personnes AR Visitors,
avec leur photo principale et jusqu'à cinq photos secondaires.

Le navigateur recherche une correspondance avec une distance inférieure à 0,45.
Si deux personnes ont des distances trop proches (écart inférieur à 0,05), le parcours
demande une identification par CIN / passeport. Une seule personne doit être visible.
La comparaison n'est pas une détection de présence réelle (anti-photo).
La caméra nécessite HTTPS ou localhost et l'autorisation du navigateur.
La comparaison des références est effectuée à chaque recherche et peut être lente
pour un grand répertoire.

Après confirmation de l'identité reconnue, le visiteur passe au choix de langue ; une personne
inconnue passe d'abord par la saisie CIN / passeport. La photo capturée est conservée
sur la nouvelle visite. La règle de validité du quiz, la signature d'entrée et la
notification restent celles du parcours existant. La comparaison est une assistance
au poste d'accueil et ne constitue pas une preuve d'identité vérifiée côté serveur.

Cette intégration ne crée pas de pointage RH et utilise des méthodes Odoo authentifiées
et les droits de lecture des personnes.


### Langue du parcours visiteur

La langue choisie à l’accueil est transmise aux formulaires d’identification,
à la fiche visiteur, au parcours en borne et à la signature de sortie. Les textes
propres au module sont regroupés dans `visitor_i18n.py`, y compris les libellés
et les erreurs de validation. Les vues sont traduites selon le contexte `lang`,
qui fait partie de la clé de cache Odoo, sans modifier la langue de l’opérateur.
Les formulaires arabes s’affichent de droite à gauche.

La sortie utilise la langue choisie pour cette interaction, sans changer la langue
historique de la visite. Reprendre un quiz inachevé dans une autre langue ouvre
le quiz configuré pour cette langue et conserve l’ancienne participation dans
Survey. Dans la même langue, les réponses en cours sont conservées. Le contenu
des questions reste celui des questionnaires configurés par langue dans Odoo.

Après installation de cette modification (version 19.0.1.11.0), redémarrer Odoo
avec une mise à niveau du module `ar_visitors` pour charger les vues et le champ
langue du formulaire de sortie, puis actualiser les ressources du navigateur.

Vérifications locales : `node --test tests/face_position_retry.cjs` et
`python tests/test_visitor_localization.py` (ce dernier requiert lxml).

### Correction immédiate du quiz visiteurs (19.0.1.12.0)

Les participations liées à une visite avec un jeton de borne valide affichent une
correction après validation lorsqu'une réponse notée est fausse ou incomplète.
Les bonnes réponses proviennent de Sondages ; aucune réponse enregistrée ni
aucun point n'est modifié par l'affichage de la correction. La dernière correction
reste ouverte jusqu'au clic du visiteur, avant le retour au parcours.

Pour un déroulement question par question, configurer le sondage avec **une page
par question**, activer la notation et renseigner les bonnes réponses. Si plusieurs
questions sont sur la même page, leurs erreurs sont regroupées après validation
de cette page. Les questions sans correction configurée et les types non notables
(par exemple texte libre ou matrice) gardent le fonctionnement standard.
Les sondages sans lien avec une visite et les sessions en direct ne sont pas modifiés.

Mettre à niveau ar_visitors et redémarrer Odoo pour charger le contrôleur, le
bundle survey.survey_assets et la nouvelle version du script de borne.
Validation locale isolée : tests/test_survey_feedback.py et tests/survey_feedback.cjs.
Une validation sur une base Odoo 19 avec un vrai questionnaire reste nécessaire.
### Enregistrement sans attente du mail (19.0.1.13.0)

La borne ferme la fenêtre et recharge l'accueil dès le chargement de la réponse
confirmant l'enregistrement, sans temporisation de trois secondes. Les erreurs
de validation conservent le formulaire ouvert. L'entrée est enregistrée avant
la fermeture ; le mail est marqué « À envoyer » puis traité par la tâche
« AR - Visitors : notifier les contacts en arrière-plan », déclenchée après
l'enregistrement et planifiée chaque minute. Les états « Envoyée » / « Échec »
restent mis à jour par le mécanisme existant, avec relance manuelle en cas d'échec.
L'envoi dépend de l'exécution des tâches planifiées et du serveur de messagerie.
Mettre à niveau ar_visitors et redémarrer Odoo pour créer la tâche planifiée.
Tests : tests/kiosk_success.cjs et tests/test_async_notification.py.

### Pré-enregistrement à distance (19.0.1.14.0)

L’affichage du menu Invitations est attribuable séparément dans les droits de
l’utilisateur : **AR - Visitors - Invitations → Afficher le menu Invitations**.
Ce groupe contrôle uniquement la visibilité du menu ; les droits métier existants
sur les invitations restent inchangés. Une mise à niveau du module est nécessaire.

Dans **AR Visitors → Invitations**, saisir l’e-mail, la date prévue et la langue,
puis envoyer le lien personnel. Le visiteur accède directement au pré-enregistrement grâce au lien personnel reçu
par e-mail, sans code et sans compte Odoo interne. Il complète son consentement, son identité,
ses coordonnées, sa photo puis le quiz de sécurité.

Le score de réussite du sondage doit être atteint. La réussite marque le dossier
« Pré-enregistré — en attente d’arrivée » sans créer de visite ni notifier de
contact. Le jour prévu, la reconnaissance ou la saisie du CIN reprend ce dossier
dans la société de l’accueil. Si le quiz est toujours valide et sa configuration
active inchangée, le visiteur passe au choix du contact, au motif et à la signature.
L’entrée et la notification ne sont enregistrées qu’après validation sur place.

Mettre à niveau ar_visitors et redémarrer Odoo. Configurer une URL publique HTTPS
dans le paramètre système **ar_visitors.public_base_url**, la messagerie sortante et ses tâches planifiées, les langues
Odoo et un quiz noté actif par langue/société, sans connexion Odoo obligatoire
ni session en direct. Les extensions de Sondages sont contenues dans ar_visitors ;
aucun fichier du module standard survey n’est modifié.

`ar_visitors.public_base_url` est utilisé uniquement pour les liens d’invitation.
Il permet de conserver l’adresse interne dans `web.base.url`. Indiquer l’origine
HTTPS publique de la même base, sans chemin (pas de `/odoo` ou `/web`), sans paramètres.
Si le paramètre est absent ou vide, le module utilise `web.base.url`, qui doit alors
être en HTTPS. Un paramètre renseigné mais invalide bloque l’envoi avec un message
explicite. L’adresse publique doit déjà être accessible depuis l’extérieur ; ce
réglage ne configure ni le serveur HTTPS ni le réseau.

Les invitations expirent à la fin du jour prévu (UTC). Un renvoi remplace le lien
précédent. Pour reporter une visite, annuler puis dupliquer l’invitation et changer
la date. Le lien donne accès au dossier à toute personne qui le possède ; il ne
doit pas être partagé. Son ouverture crée une session qui protège aussi le quiz.
La session dure deux heures et protège aussi les anciennes participations au
quiz. Aucune purge automatique des identités ou résultats n’est introduite.

Chaque invitation déclenche maintenant la tâche standard
`Mail: Email Queue Manager` dès sa mise en file, sans attendre son intervalle
habituel. L’envoi intervient après validation de la transaction et prise en charge
par le serveur de tâches planifiées ; ce n’est pas une garantie de livraison
instantanée. Cette tâche doit être active et les workers cron doivent fonctionner.
Redémarrer Odoo après remplacement du fichier `models/visitor_invitation.py`.

Tests : tests/test_preregistration.py et tests/odoo_prereg_smoke.py (base Odoo
jetable, mails simulés, données de test annulées), ainsi que les tests existants
de correction du quiz, de langue et de notification.

### Accès direct par invitation

La page distante réutilise désormais la feuille de style de l’accueil borne
(`face_attendance_bridge.scss`) dans le bundle `ar_visitors.public_reception` :
même en-tête, colonne d’accueil, étapes, bouton vert, langues avec drapeaux et
cadre caméra. Le bouton de sortie reste réservé à la borne. Le contrôleur public
conserve les accès par invitation et ne charge pas les services internes de
reconnaissance ni les références faciales des autres visiteurs.

Le lien ouvre un accueil public avec logo, langues, étapes et aperçu caméra.
« Préparer ma visite » affiche le consentement ; l’acceptation capture la photo
puis ouvre les informations d’identité dans une fenêtre. Le refus ne capture
aucune photo. Le quiz reste la dernière étape distante. La caméra nécessite
l’autorisation du navigateur ; aucun accès aux références faciales de la borne
n’est exposé à cette page publique. Mettre à niveau le module pour charger la vue.

L’étape du code par e-mail est supprimée. Les liens personnels déjà envoyés et
encore valides ouvrent directement le parcours. Les liens expirés, annulés,
remplacés ou consommés à l’accueil restent inutilisables. Les anciens formulaires
de demande/vérification de code ne déclenchent plus aucune opération. Les champs
et méthodes OTP historiques sont conservés pour compatibilité, sans route active.
Mettre à niveau ar_visitors et redémarrer Odoo pour charger les vues et contrôleurs.

### Entrée invitation avant sélection de base

La route `/ar-visitors/pre-register/<token>` est disponible sans base sélectionnée
quand `ar_visitors` est chargé au démarrage. Elle utilise le mécanisme Odoo
`ensure_db` pour sélectionner exclusivement `1051_PROD`, même si une autre base
est indiquée dans l’URL ou dans la session. Après une redirection technique avec
le cookie de session, elle active l’utilisateur public et vérifie l’invitation.
Un lien valide ouvre directement l’accueil distant, sans connexion ni code.
Les liens existants conservent leur URL.

Dans la configuration du serveur, conserver les modules de démarrage existants
et ajouter `ar_visitors`, par exemple :

```ini
server_wide_modules = base,rpc,web,ar_visitors
dbfilter = .*
db_name =
```

Le module doit être installé dans `1051_PROD`, et cette base doit exister.
Le filtre général permet de continuer à sélectionner manuellement les autres
bases. Vérifier également qu’aucun argument de lancement `-d`, `--db-filter`
ou `--load` ne remplace ces réglages. Un seul service Odoo suffit. Redémarrer
le serveur après modification du code et de la configuration.

Tests sans base : `python -m unittest discover -s tests -p "test_invitation*.py"`.
