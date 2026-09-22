import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Article, Row } from "@/components/legal/legal-page";
import { legal } from "@/lib/legal";
import { PLANS, PLAN_ORDER } from "@/lib/plans";

export const metadata: Metadata = {
  title: "Conditions d'utilisation",
  description: `Les règles d'utilisation de ${legal.appName} : compte, crédits, abonnements, propriété des contenus et publication sur les réseaux sociaux.`,
};

export default function TermsPage() {
  const contact = legal.contactEmail || "[e-mail de contact à renseigner]";
  return (
    <LegalPage
      title="Conditions d'utilisation"
      intro={`Ces conditions régissent votre utilisation de ${legal.appName}. En créant un compte, vous les acceptez. Nous les avons écrites pour être lisibles : si un point vous semble ambigu, écrivez-nous et nous le clarifierons.`}
    >
      <Article title="1. Le service">
        <p>{legal.appName} est un service en ligne qui permet de générer des vidéos courtes à partir d&apos;un sujet : rédaction de script assistée par intelligence artificielle, voix off de synthèse, sous-titres animés, sélection de séquences vidéo, rendu d&apos;un fichier MP4, et publication facultative sur TikTok, YouTube et Instagram.</p>
        <p>Le service est fourni « en l&apos;état ». Il évolue régulièrement : des fonctionnalités peuvent être ajoutées, modifiées ou retirées.</p>
      </Article>

      <Article title="2. Compte">
        <p>La création d&apos;un compte requiert une adresse e-mail valide. Vous êtes responsable de la confidentialité de vos identifiants et des actions effectuées depuis votre compte.</p>
        <p>Un compte est personnel. Le partage d&apos;identifiants entre plusieurs personnes n&apos;est pas autorisé ; les formules multi-espaces existent pour cet usage.</p>
        <p>Vous devez avoir au moins 15 ans pour utiliser le service.</p>
      </Article>

      <Article title="3. Crédits, forfaits et paiement">
        <p>L&apos;utilisation du service consomme des crédits. Chaque opération facturable est débitée <strong className="text-foreground">avant</strong> son exécution et <strong className="text-foreground">automatiquement remboursée</strong> si elle échoue pour une raison technique.</p>
        <div className="mt-4">
          {PLAN_ORDER.map((id) => {
            const p = PLANS[id];
            return (
              <Row key={id} label={`${p.name}${p.priceMonthly === 0 ? " (gratuit)" : ` — ${(p.priceMonthly / 100).toFixed(0)} €/mois`}`}>
                {p.monthlyCredits} crédits par mois · exports {p.maxResolution}{p.watermark ? " avec filigrane" : " sans filigrane"}
              </Row>
            );
          })}
        </div>
        <p>Les abonnements sont sans engagement et résiliables à tout moment depuis la page Facturation. La résiliation prend effet à la fin de la période déjà payée : aucun remboursement au prorata n&apos;est effectué pour la période en cours.</p>
        <p>Les crédits inclus dans un forfait sont réinitialisés à chaque période mensuelle et ne se cumulent pas d&apos;un mois sur l&apos;autre. Les crédits achetés séparément sous forme de recharge n&apos;expirent pas.</p>
        <p>Les paiements sont traités par Stripe. Les prix sont indiqués en euros, toutes taxes comprises le cas échéant.</p>
      </Article>

      <Article title="4. Droit de rétractation">
        <p>Conformément à l&apos;article L221-28 du Code de la consommation, en souscrivant à un service numérique à exécution immédiate, vous acceptez que l&apos;exécution commence avant la fin du délai de rétractation de 14 jours et renoncez de ce fait à ce droit pour les crédits déjà consommés. Les crédits non consommés d&apos;un abonnement souscrit depuis moins de 14 jours restent remboursables sur demande à {contact}.</p>
      </Article>

      <Article title="5. Vos contenus">
        <p><strong className="text-foreground">Vous restez propriétaire de tout ce que vous créez et importez.</strong> Les scripts, voix off, montages et vidéos produits avec {legal.appName} vous appartiennent, y compris pour un usage commercial, sur tous les forfaits.</p>
        <p>Vous nous accordez uniquement la licence technique limitée nécessaire pour héberger, traiter et afficher vos contenus dans le cadre du service — par exemple pour effectuer un rendu ou publier une vidéo à votre demande. Cette licence prend fin lorsque vous supprimez le contenu concerné.</p>
        <p>Vous garantissez détenir les droits sur les fichiers que vous importez, et notamment que votre échantillon vocal, si vous utilisez le clonage de voix, est bien le vôtre.</p>
      </Article>

      <Article title="6. Séquences issues des banques d'images">
        <p>Les vidéos et photos proposées automatiquement proviennent de Pexels et Pixabay et sont soumises aux licences de ces plateformes, qui autorisent l&apos;usage commercial sans attribution obligatoire. Il vous appartient de vérifier la licence applicable si vous envisagez un usage particulier, notamment pour les séquences représentant des personnes identifiables ou des marques.</p>
      </Article>

      <Article title="7. Usages interdits">
        <p>Il est interdit d&apos;utiliser {legal.appName} pour produire ou diffuser :</p>
        <p>— des contenus illicites, haineux, diffamatoires, harcelants ou incitant à la violence ;<br />
        — des contenus pornographiques ou mettant en scène des mineurs de manière inappropriée ;<br />
        — de la désinformation présentée comme des faits avérés, notamment en matière de santé ou d&apos;élections ;<br />
        — des contenus usurpant l&apos;identité d&apos;une personne réelle, en particulier au moyen du clonage vocal d&apos;une voix qui n&apos;est pas la vôtre ;<br />
        — des contenus portant atteinte aux droits d&apos;auteur ou aux marques de tiers.</p>
        <p>Il est également interdit de tenter de contourner les limites de votre forfait, de revendre l&apos;accès au service, ou d&apos;en automatiser l&apos;usage en dehors des interfaces prévues.</p>
        <p>Le non-respect de ces règles peut entraîner la suspension ou la suppression du compte, sans remboursement.</p>
      </Article>

      <Article title="8. Publication sur les réseaux sociaux">
        <p>La connexion d&apos;un compte TikTok, YouTube ou Instagram est facultative. Lorsque vous l&apos;utilisez, vous restez seul responsable des contenus publiés et du respect des conditions d&apos;utilisation de chaque plateforme.</p>
        <p>Ces plateformes peuvent modifier ou restreindre leurs interfaces de publication à tout moment. Une indisponibilité de la publication automatique qui en résulterait ne constitue pas un manquement de notre part ; les vidéos restent téléchargeables et publiables manuellement.</p>
      </Article>

      <Article title="9. Intelligence artificielle : ce que nous ne garantissons pas">
        <p>Les scripts et les voix off sont générés automatiquement. Les scores de viralité, de rétention et de clarté affichés dans le studio sont des <strong className="text-foreground">estimations indicatives</strong>, produites par un modèle : ils ne constituent aucune garantie de performance réelle sur les réseaux sociaux.</p>
        <p>Vous êtes responsable de la relecture et de la vérification des contenus générés avant publication, notamment de l&apos;exactitude des informations factuelles qu&apos;ils contiennent.</p>
      </Article>

      <Article title="10. Disponibilité et responsabilité">
        <p>Nous nous efforçons d&apos;assurer la continuité du service sans pouvoir la garantir : des interruptions peuvent survenir pour maintenance, incident technique, ou défaillance d&apos;un prestataire tiers (hébergeur, fournisseur d&apos;IA, plateforme sociale).</p>
        <p>Notre responsabilité est limitée aux dommages directs et ne peut excéder le montant que vous avez versé au cours des douze derniers mois. Nous ne saurions être tenus responsables des pertes indirectes, notamment d&apos;un manque à gagner, d&apos;une perte d&apos;audience ou de la suspension d&apos;un compte par une plateforme tierce.</p>
        <p>Ces limitations ne s&apos;appliquent pas en cas de faute lourde ou intentionnelle, ni aux droits que la loi reconnaît aux consommateurs de manière impérative.</p>
      </Article>

      <Article title="11. Résiliation">
        <p>Vous pouvez supprimer votre compte à tout moment depuis la page Paramètres. Nous pouvons suspendre un compte en cas de manquement caractérisé à ces conditions, après vous en avoir informé sauf urgence manifeste.</p>
      </Article>

      <Article title="12. Modifications des conditions">
        <p>Ces conditions peuvent évoluer. Toute modification substantielle sera notifiée par e-mail au moins 30 jours avant son entrée en vigueur. Poursuivre l&apos;utilisation du service après cette date vaut acceptation.</p>
      </Article>

      <Article title="13. Droit applicable">
        <p>Ces conditions sont régies par le droit français. En cas de litige, une solution amiable sera recherchée en priorité — écrivez à {contact}. À défaut d&apos;accord, les tribunaux français sont compétents. Les consommateurs peuvent également recourir gratuitement à un médiateur de la consommation ou à la plateforme européenne de règlement en ligne des litiges.</p>
      </Article>

      <p className="border-t border-white/[0.06] pt-6 text-sm text-muted-foreground">
        Voir aussi la <Link href="/privacy" className="text-brand-300 underline underline-offset-2">Politique de confidentialité</Link> et les <Link href="/legal" className="text-brand-300 underline underline-offset-2">Mentions légales</Link>.
      </p>
    </LegalPage>
  );
}
