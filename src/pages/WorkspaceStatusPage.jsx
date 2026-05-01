import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Clock3, Loader2, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import i18n from '../i18n';

const pageMeta = {
  '/no-workspace': {
    icon: Clock3,
    title: ['Your workspace is not created yet', 'Votre espace n’est pas encore créé'],
    subtitle: ['The admin team will create your isolated workspace before you can access operations.', 'L’équipe admin va créer votre espace isolé avant l’accès aux opérations.'],
  },
  '/workspace-pending': {
    icon: Clock3,
    title: ['Workspace not ready yet', 'Espace pas encore prêt'],
    subtitle: ['Your workspace request is waiting to be provisioned.', 'Votre demande d’espace attend le provisionnement.'],
  },
  '/workspace-preparing': {
    icon: Loader2,
    title: ['Your private workspace is being prepared', 'Votre espace privé est en préparation'],
    subtitle: ['This usually takes a few moments.', 'Cela prend généralement quelques instants.'],
    spin: true,
  },
  '/workspace-error': {
    icon: AlertCircle,
    title: ['We couldn’t prepare your workspace yet', "Nous n'avons pas encore pu préparer votre espace"],
    subtitle: [
      'Your private tenant workspace could not be created because the current infrastructure account has reached its active project capacity. Your signup is still saved and we can retry as soon as capacity is available.',
      "Votre espace tenant privé n'a pas pu être créé car le compte d'infrastructure actuel a atteint sa capacité de projets actifs. Votre inscription est bien enregistrée et nous pourrons relancer le provisionnement dès qu'une capacité sera disponible.",
    ],
  },
  '/workspace-suspended': {
    icon: ShieldAlert,
    title: ['Workspace suspended', 'Espace suspendu'],
    subtitle: ['Please contact support.', 'Veuillez contacter le support.'],
  },
};

const WorkspaceStatusPage = ({ status = 'preparing' }) => {
  const { signOut } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const pathKey = status.startsWith('/') ? status : `/workspace-${status}`;
  const meta = pageMeta[pathKey] || pageMeta['/workspace-preparing'];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#ede9fe_0,#f8fafc_34%,#f8fafc_100%)] px-4 py-10 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-3xl items-center justify-center">
        <div className="w-full overflow-hidden rounded-[34px] border border-white/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.12)]">
          <div className="bg-gradient-to-br from-slate-950 via-violet-950 to-violet-800 px-6 py-8 text-white sm:px-8">
            <p className="text-xs font-bold uppercase tracking-[0.26em] text-violet-200">
              {isFrench ? 'Espace tenant privé' : 'Private tenant workspace'}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight">{isFrench ? meta.title[1] : meta.title[0]}</h1>
            <p className="mt-3 max-w-2xl text-sm font-medium text-violet-100">{isFrench ? meta.subtitle[1] : meta.subtitle[0]}</p>
          </div>
          <div className="space-y-6 px-6 py-8 text-center sm:px-8">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[26px] bg-violet-50 text-violet-700">
              <Icon className={`h-7 w-7 ${meta.spin ? 'animate-spin' : ''}`} />
            </div>
            <p className="mx-auto max-w-md text-sm font-medium leading-6 text-slate-600">
              {isFrench
                ? "Votre compte ne sera pas envoyé vers l'admin principal SaharaX tant que l'espace isolé n'est pas prêt. Aucune donnée n'a été perdue pendant l'échec de provisionnement."
                : 'Your account will not be sent into the main SaharaX admin while the isolated workspace is not ready. No signup data was lost during this provisioning failure.'}
            </p>
            <div className="flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/website" className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-violet-800">
                {isFrench ? 'Retour au site' : 'Return to website'}
              </Link>
              <button type="button" onClick={() => signOut()} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700">
                {isFrench ? 'Déconnexion' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkspaceStatusPage;
