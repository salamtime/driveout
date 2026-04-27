import React from 'react';
import { Link } from 'react-router-dom';
import AccountWorkspaceHero from './AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from './AccountWorkspaceSectionHeader';

const AccountWorkspacePlaceholder = ({ eyebrow, title, description, actions = [], notes = [] }) => (
  <div className="space-y-6">
    <AccountWorkspaceHero eyebrow={eyebrow} title={title} description={description}>
      {actions.length ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {actions.map((action) => (
            <Link
              key={action.href}
              to={action.href}
              className={`inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-bold transition ${
                action.primary
                  ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white shadow-[0_18px_40px_rgba(79,70,229,0.24)] hover:-translate-y-0.5'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </AccountWorkspaceHero>

    {notes.length ? (
      <section className="grid gap-4 lg:grid-cols-2">
        {notes.map((note) => (
          <div key={note.title} className="rounded-[1.75rem] border border-violet-100 bg-[linear-gradient(180deg,#ffffff_0%,#f5f3ff_100%)] p-5 shadow-[0_18px_44px_rgba(79,70,229,0.06)]">
            <AccountWorkspaceSectionHeader title={note.title} />
            <p className="mt-2 text-sm leading-6 text-slate-600">{note.body}</p>
          </div>
        ))}
      </section>
    ) : null}
  </div>
);

export default AccountWorkspacePlaceholder;
